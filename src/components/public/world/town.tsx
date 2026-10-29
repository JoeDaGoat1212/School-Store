"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { canvasTexture, noRaycast, seededRandom, toonRamp } from "./paint";
import {
  BUSHES,
  CURB,
  DRIVEWAY,
  HOUSES,
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
  const plain = <meshStandardMaterial color="#4b5057" roughness={0.95} />;
  return (
    <group>
      {roads.map((r, i) => (
        <mesh key={i} geometry={r.geometry} position={r.position} receiveShadow raycast={noRaycast}>
          <meshStandardMaterial map={tex} roughness={0.95} />
        </mesh>
      ))}
      {/* Plain squares where roads cross (no lines through the middle) */}
      {INTERSECTIONS.map((p) => (
        <mesh key={`${p.x}${p.z}`} geometry={patch} position={[p.x, 0.03, p.z]} receiveShadow raycast={noRaycast}>
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
      <meshStandardMaterial color="#d9d5cc" roughness={0.9} />
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

const WITH_CHIMNEY = HOUSES.filter((h) => h.chimney);
const windowSide = (i: number) => (i % 2 ? 1 : -1);

const placeWall: Place = (i, o) => {
  const h = HOUSES[i];
  onHouse(h, 0, h.h / 2, 0, o);
  o.scale.set(h.w, h.h, h.d);
  return h.wall;
};
const placeRoof: Place = (i, o) => {
  const h = HOUSES[i];
  onHouse(h, 0, h.h - 0.02, 0, o);
  o.scale.set(h.w + 1.2, h.roofH, h.d + 1.2); // a little overhang all round
  return h.roof;
};
const placeDoor: Place = (i, o) => {
  const h = HOUSES[i];
  onHouse(h, 0, 1.7, h.d / 2 + 0.06, o);
  o.scale.set(1.7, 3.4, 0.2);
  return h.door;
};
// Two front windows each: white frames, then glass.
const placeFrame: Place = (i, o) => {
  const h = HOUSES[i >> 1];
  onHouse(h, windowSide(i) * (h.w / 4 + 0.6), h.h * 0.56, h.d / 2 + 0.05, o);
  o.scale.set(2.7, 2.5, 0.16);
};
const placeGlass: Place = (i, o) => {
  const h = HOUSES[i >> 1];
  onHouse(h, windowSide(i) * (h.w / 4 + 0.6), h.h * 0.56, h.d / 2 + 0.12, o);
  o.scale.set(2.2, 2.0, 0.1);
};
const placeChimney: Place = (i, o) => {
  const h = WITH_CHIMNEY[i];
  onHouse(h, h.w / 4, h.h + h.roofH * 0.55, -h.d / 5, o);
  o.scale.set(1.2, h.roofH * 0.9 + 1.2, 1.2);
};
// A path from the front door to the sidewalk.
const placePath: Place = (i, o) => {
  const h = HOUSES[i];
  onHouse(h, 0, 0.04, h.d / 2 + h.setback / 2, o);
  o.scale.set(2, 0.08, h.setback);
};

function Houses() {
  const n = HOUSES.length;
  const roof = useMemo(() => roofGeometry(), []);
  useEffect(() => () => roof.dispose(), [roof]);
  return (
    <group>
      <Instances count={n} place={placeWall} castShadow receiveShadow>
        <boxGeometry />
        <meshToonMaterial gradientMap={toonRamp()} />
      </Instances>
      <Instances count={n} place={placeRoof} geometry={roof} castShadow>
        <meshToonMaterial gradientMap={toonRamp()} />
      </Instances>
      <Instances count={n} place={placeDoor}>
        <boxGeometry />
        <meshStandardMaterial roughness={0.6} />
      </Instances>
      <Instances count={n * 2} place={placeFrame}>
        <boxGeometry />
        <meshStandardMaterial color="#ffffff" roughness={0.7} />
      </Instances>
      <Instances count={n * 2} place={placeGlass}>
        <boxGeometry />
        <meshStandardMaterial color="#9fd3f0" roughness={0.15} metalness={0.3} />
      </Instances>
      <Instances count={WITH_CHIMNEY.length} place={placeChimney} castShadow>
        <boxGeometry />
        <meshToonMaterial color="#9a4a3a" gradientMap={toonRamp()} />
      </Instances>
      <Instances count={n} place={placePath} receiveShadow>
        <boxGeometry />
        <meshStandardMaterial color="#cfc8bb" roughness={0.9} />
      </Instances>
    </group>
  );
}

// ---- Nature -----------------------------------------------------------------------------------

const GREENS = ["#4c9a3b", "#5cb045", "#3f8a35", "#69b84f"];
const placeTrunk: Place = (i, o) => {
  const t = TOWN_TREES[i];
  o.position.set(t.x, 1.6 * t.s, t.z);
  o.scale.set(t.s, t.s, t.s);
};
const placeLowLeaves: Place = (i, o) => {
  const t = TOWN_TREES[i];
  o.position.set(t.x, 4.2 * t.s, t.z);
  o.scale.setScalar(2.4 * t.s);
  return GREENS[i % GREENS.length];
};
const placeHighLeaves: Place = (i, o) => {
  const t = TOWN_TREES[i];
  o.position.set(t.x + 0.3 * t.s, 5.9 * t.s, t.z - 0.2 * t.s);
  o.scale.setScalar(1.6 * t.s);
  return GREENS[(i + 1) % GREENS.length];
};

function Trees() {
  const n = TOWN_TREES.length;
  return (
    <group>
      <Instances count={n} place={placeTrunk} castShadow>
        <cylinderGeometry args={[0.35, 0.5, 3.2, 7]} />
        <meshToonMaterial color="#8a5a35" gradientMap={toonRamp()} />
      </Instances>
      <Instances count={n} place={placeLowLeaves} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshToonMaterial gradientMap={toonRamp()} />
      </Instances>
      <Instances count={n} place={placeHighLeaves} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshToonMaterial gradientMap={toonRamp()} />
      </Instances>
    </group>
  );
}

const placeBush: Place = (i, o) => {
  const b = BUSHES[i];
  o.position.set(b.x, 0.7 * b.s, b.z);
  o.scale.set(1.2 * b.s, 0.95 * b.s, 1.1 * b.s);
  return ["#4f9a3d", "#5fae47", "#3e8c3a", "#77b85a"][i % 4];
};

function Bushes() {
  return (
    <Instances count={BUSHES.length} place={placeBush}>
      <icosahedronGeometry args={[1, 1]} />
      <meshToonMaterial gradientMap={toonRamp()} />
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

function Walkers() {
  const n = WALKERS.length;
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const legs = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);
  const hair = useRef<THREE.InstancedMesh>(null);
  // Limbs swing from the top: shift their shapes so the hinge is at the top.
  const legGeo = useMemo(() => new THREE.BoxGeometry(0.3, 1.5, 0.32).translate(0, -0.75, 0), []);
  const armGeo = useMemo(() => new THREE.BoxGeometry(0.22, 1.25, 0.24).translate(0, -0.62, 0), []);
  useEffect(
    () => () => {
      legGeo.dispose();
      armGeo.dispose();
    },
    [legGeo, armGeo],
  );

  // Colours once.
  useLayoutEffect(() => {
    const c = new THREE.Color();
    WALKERS.forEach((w, i) => {
      bodies.current?.setColorAt(i, c.set(w.shirt));
      heads.current?.setColorAt(i, c.set(w.skin));
      hair.current?.setColorAt(i, c.set(i % 3 ? "#2a1a12" : "#6b4423"));
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
    WALKERS.forEach((w, i) => {
      const p = walkerAt(w, t);
      walkerSpots[i].x = p.x;
      walkerSpots[i].z = p.z;
      const s = w.height;
      const swing = Math.sin(t * w.speed * 2.6 + i) * 0.55;
      const bob = Math.abs(Math.cos(t * w.speed * 2.6 + i)) * 0.06;
      const put = (m: THREE.InstancedMesh, idx: number, lx: number, y: number, lz: number, rx = 0, scale = 1) => {
        tmp.set(lx, 0, lz).applyAxisAngle(THREE.Object3D.DEFAULT_UP, p.heading);
        dummy.position.set(p.x + tmp.x, y, p.z + tmp.z);
        dummy.rotation.set(rx, p.heading, 0, "YXZ");
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        m.setMatrixAt(idx, dummy.matrix);
      };
      put(bodies.current!, i, 0, (1.5 + 0.8) * s + bob, 0, 0, s);
      put(heads.current!, i, 0, 3.55 * s + bob, 0, 0, s);
      put(hair.current!, i, 0, 3.72 * s + bob, -0.05, 0, s);
      put(legs.current!, i * 2, -0.2 * s, 1.5 * s + bob, 0, swing, s);
      put(legs.current!, i * 2 + 1, 0.2 * s, 1.5 * s + bob, 0, -swing, s);
      put(arms.current!, i * 2, -0.6 * s, 3.0 * s + bob, 0, -swing * 0.8, s);
      put(arms.current!, i * 2 + 1, 0.6 * s, 3.0 * s + bob, 0, swing * 0.8, s);
    });
    for (const m of [bodies, heads, legs, arms, hair]) m.current!.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, n]} castShadow raycast={noRaycast} frustumCulled={false}>
        <boxGeometry args={[0.95, 1.6, 0.55]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, n]} raycast={noRaycast} frustumCulled={false}>
        <sphereGeometry args={[0.42, 14, 10]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={hair} args={[undefined, undefined, n]} raycast={noRaycast} frustumCulled={false}>
        <sphereGeometry args={[0.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={legs} args={[legGeo, undefined, n * 2]} raycast={noRaycast} frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={arms} args={[armGeo, undefined, n * 2]} raycast={noRaycast} frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

/** How far the sidewalk's outer edge is from a road's middle (for anyone who needs it). */
export const SIDEWALK_EDGE = CURB;
