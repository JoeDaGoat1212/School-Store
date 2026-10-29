"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { inCity } from "./city-plan";
import { Instances, type Place } from "./town";
import { noRaycast, seededRandom } from "./paint";
import { CURB, INTERSECTIONS, ROADS, ROAD_HALF, onRoad, pieces, type Road } from "./town-layout";

/*
 * The little things that make streets look real: fire hydrants, trash cans,
 * benches, bus shelters, newspaper boxes, mailboxes in the town, parking
 * meters and planters in the city, manhole covers in the road, and traffic
 * lights at the city's crossings (they change: green, amber, red). Worked
 * out once from the roads; each kind of thing is a handful of instanced
 * meshes. Nothing here can be bumped into (they're small and by the curb).
 */

type Spot = { x: number; z: number; turn: number };

/** Spots along every road's sidewalks, `every` units apart, `out` from the road's middle. */
function along(every: number, out: number, start: number, keep: (x: number, z: number, i: number) => boolean) {
  const list: Spot[] = [];
  ROADS.forEach((road: Road, ri) =>
    pieces(road, CURB + 6).forEach(([a, b]) => {
      let i = 0;
      for (let t = a + start + (ri % 3) * 3; t <= b - 4; t += every, i++)
        for (const side of [-1, 1]) {
          const { x, z } = onRoad(road, t, side * out);
          // Facing the road.
          const turn = road.axis === "x" ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
          if (keep(x, z, i + ri)) list.push({ x, z, turn });
        }
    }),
  );
  return list;
}

const nearStore = (x: number, z: number) => Math.abs(x) < 70 && z > -80 && z < 70;
const city = (x: number, z: number) => inCity(x, z);
const BY_CURB = ROAD_HALF + 0.9;
const BACK = ROAD_HALF + 3.3;

const HYDRANTS = along(70, BY_CURB, 20, (x, z) => !nearStore(x, z));
const BINS = along(48, BACK, 10, (x, z, i) => !nearStore(x, z) && i % 2 === 0);
const BENCHES = along(90, BACK, 34, (x, z) => city(x, z));
const SHELTERS = along(260, BACK, 120, (x, z) => city(x, z) || Math.abs(x) > 160);
const PAPERS = along(110, BACK, 60, (x, z) => city(x, z));
const METERS = along(16, BY_CURB, 6, (x, z, i) => city(x, z) && i % 3 !== 0);
const PLANTERS = along(36, BACK + 0.2, 24, (x, z) => city(x, z));
const MAILBOXES = along(68, BY_CURB + 0.2, 30, (x, z) => !city(x, z) && !nearStore(x, z) && Math.abs(x) < 470 && z < 440);
const MANHOLES = (() => {
  const rand = seededRandom(77);
  const list: Spot[] = [];
  for (const road of ROADS)
    for (const [a, b] of pieces(road, CURB))
      for (let t = a + 20; t < b - 10; t += 55 + rand() * 30) list.push({ ...onRoad(road, t, (rand() < 0.5 ? -1 : 1) * 3.6), turn: 0 });
  return list;
})();
/** Traffic lights: on two corners of every crossing in the city, each with an arm out over its road. */
const SIGNALS = INTERSECTIONS.filter((p) => inCity(p.x, p.z)).flatMap((p) => {
  const o = ROAD_HALF + 1.2;
  return [
    // Arms out over the avenue (for traffic along x) and over the street (traffic along z).
    { x: p.x + o, z: p.z + o, turn: Math.PI, ns: false },
    { x: p.x - o, z: p.z - o, turn: 0, ns: false },
    { x: p.x - o, z: p.z + o, turn: Math.PI / 2, ns: true },
    { x: p.x + o, z: p.z - o, turn: -Math.PI / 2, ns: true },
  ];
});

const at = (list: Spot[], y: number, sx = 1, sy = 1, sz = 1, lx = 0, lz = 0): Place => (i, o) => {
  const s = list[i];
  const c = Math.cos(s.turn);
  const n = Math.sin(s.turn);
  o.position.set(s.x + lx * c + lz * n, y, s.z - lx * n + lz * c);
  o.rotation.y = s.turn;
  o.scale.set(sx, sy, sz);
};

function Group({ list, parts }: { list: Spot[]; parts: { place: Place; geo: THREE.BufferGeometry; mat: THREE.Material; shadow?: boolean }[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <Instances key={i} count={list.length} place={p.place} geometry={p.geo} castShadow={p.shadow}>
          <primitive object={p.mat} attach="material" />
        </Instances>
      ))}
    </>
  );
}

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  dome: new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  ball: new THREE.SphereGeometry(0.5, 10, 8),
  shrub: new THREE.IcosahedronGeometry(0.5, 1),
};
const M = (color: string, rough = 0.6, metal = 0, emissive?: string) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ?? "#000000" });
const MAT = {
  red: M("#c21f1f", 0.45, 0.2),
  chrome: M("#c9ced4", 0.25, 0.85),
  dark: M("#23272c", 0.5, 0.5),
  green: M("#2f5e3b", 0.6, 0.2),
  wood: M("#8a5a35", 0.8),
  glass: new THREE.MeshPhysicalMaterial({ color: "#bfe3f5", roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false }),
  ad: M("#ffffff", 0.4, 0, "#f6efe0"),
  paper: M("#1d4f91", 0.5, 0.2),
  mailbox: M("#2a5db0", 0.45, 0.3),
  iron: M("#3a3d42", 0.7, 0.6),
  terracotta: M("#9c5a3c", 0.85),
  leaf: M("#3f7d32", 0.9),
};

export function StreetProps() {
  return (
    <group>
      {/* Fire hydrants */}
      <Group
        list={HYDRANTS}
        parts={[
          { place: at(HYDRANTS, 0.55, 0.5, 1.1, 0.5), geo: G.cyl, mat: MAT.red, shadow: true },
          { place: at(HYDRANTS, 1.1, 0.56, 0.5, 0.56), geo: G.dome, mat: MAT.red },
          { place: at(HYDRANTS, 0.75, 0.9, 0.22, 0.22), geo: G.cyl6, mat: MAT.red },
          { place: at(HYDRANTS, 0.06, 0.7, 0.12, 0.7), geo: G.cyl, mat: MAT.red },
        ]}
      />
      {/* Trash cans */}
      <Group
        list={BINS}
        parts={[
          { place: at(BINS, 0.75, 1, 1.5, 1), geo: G.cyl, mat: MAT.green, shadow: true },
          { place: at(BINS, 1.55, 1.06, 0.12, 1.06), geo: G.cyl, mat: MAT.dark },
        ]}
      />
      {/* Benches (seat, back, legs), facing the road */}
      <Group
        list={BENCHES}
        parts={[
          { place: at(BENCHES, 0.85, 3.4, 0.12, 0.9, 0, -0.1), geo: G.box, mat: MAT.wood, shadow: true },
          { place: at(BENCHES, 1.55, 3.4, 0.7, 0.1, 0, -0.55), geo: G.box, mat: MAT.wood },
          { place: at(BENCHES, 0.42, 0.12, 0.85, 0.9, -1.4, -0.1), geo: G.box, mat: MAT.iron },
          { place: at(BENCHES, 0.42, 0.12, 0.85, 0.9, 1.4, -0.1), geo: G.box, mat: MAT.iron },
        ]}
      />
      {/* Bus shelters: a glass box with a roof, a bench and a lit advert */}
      <Group
        list={SHELTERS}
        parts={[
          { place: at(SHELTERS, 3.1, 6.4, 0.18, 2.6, 0, -0.4), geo: G.box, mat: MAT.dark, shadow: true },
          { place: at(SHELTERS, 1.6, 6, 2.8, 0.06, 0, -1.6), geo: G.box, mat: MAT.glass },
          { place: at(SHELTERS, 1.6, 0.06, 2.8, 2.2, -3, -0.5), geo: G.box, mat: MAT.ad },
          { place: at(SHELTERS, 1.5, 0.12, 3, 0.12, 3, 0.8), geo: G.box, mat: MAT.dark },
          { place: at(SHELTERS, 1.5, 0.12, 3, 0.12, -3, 0.8), geo: G.box, mat: MAT.dark },
          { place: at(SHELTERS, 0.8, 4, 0.1, 0.7, 0, -1.1), geo: G.box, mat: MAT.wood },
        ]}
      />
      {/* Newspaper boxes */}
      <Group list={PAPERS} parts={[{ place: at(PAPERS, 0.7, 0.8, 1.4, 0.7), geo: G.box, mat: MAT.paper, shadow: true }]} />
      {/* Parking meters */}
      <Group
        list={METERS}
        parts={[
          { place: at(METERS, 0.65, 0.09, 1.3, 0.09), geo: G.cyl6, mat: MAT.iron },
          { place: at(METERS, 1.45, 0.32, 0.45, 0.24), geo: G.box, mat: MAT.chrome },
        ]}
      />
      {/* Planters with shrubs */}
      <Group
        list={PLANTERS}
        parts={[
          { place: at(PLANTERS, 0.4, 1.8, 0.8, 1.8), geo: G.box, mat: MAT.terracotta, shadow: true },
          { place: at(PLANTERS, 1.15, 1.9, 1.3, 1.9), geo: G.shrub, mat: MAT.leaf, shadow: true },
        ]}
      />
      {/* Mailboxes on posts, in the town */}
      <Group
        list={MAILBOXES}
        parts={[
          { place: at(MAILBOXES, 0.6, 0.12, 1.2, 0.12), geo: G.box, mat: MAT.wood },
          { place: at(MAILBOXES, 1.35, 0.5, 0.45, 0.8), geo: G.box, mat: MAT.mailbox, shadow: true },
        ]}
      />
      {/* Manhole covers */}
      <Group list={MANHOLES} parts={[{ place: at(MANHOLES, 0.035, 1.4, 0.02, 1.4), geo: G.disc, mat: MAT.iron }]} />
      <TrafficLights />
    </group>
  );
}

/** The city's traffic lights: a pole, an arm over the road, a signal head, and lamps that change. */
function TrafficLights() {
  const red = useRef<THREE.InstancedMesh>(null);
  const amber = useRef<THREE.InstancedMesh>(null);
  const green = useRef<THREE.InstancedMesh>(null);
  const phase = useRef(-1);
  const list = SIGNALS;
  const head = useMemo(() => at(list, 6.2, 0.6, 1.7, 0.5, 0, 4.4), [list]);
  useFrame(({ clock }) => {
    // 14 s each way: green 10 s, amber 4 s (the other way's red throughout).
    const t = clock.elapsedTime % 28;
    const p = t < 10 ? 0 : t < 14 ? 1 : t < 24 ? 2 : 3;
    if (p === phase.current) return;
    phase.current = p;
    const on = new THREE.Color();
    const lamp = (m: THREE.InstancedMesh | null, lit: (ns: boolean) => boolean, color: string) => {
      if (!m) return;
      list.forEach((s, i) => m.setColorAt(i, lit(s.ns) ? on.set(color) : on.set("#1a1a1a")));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    lamp(green.current, (ns) => (ns ? p === 0 : p === 2), "#3dff7a");
    lamp(amber.current, (ns) => (ns ? p === 1 : p === 3), "#ffb81f");
    lamp(red.current, (ns) => (ns ? p >= 2 : p <= 1), "#ff2a1a");
  });
  const lampPlace = (y: number): Place => (i, o) => {
    head(i, o);
    o.position.y = y;
    const s = list[i];
    o.position.x += Math.sin(s.turn) * -0.27;
    o.position.z += Math.cos(s.turn) * -0.27;
    o.scale.setScalar(0.36);
  };
  return (
    <group>
      <Instances count={list.length} place={at(list, 3.3, 0.24, 6.6, 0.24)} geometry={G.cyl6} castShadow>
        <primitive object={MAT.dark} attach="material" />
      </Instances>
      <Instances count={list.length} place={at(list, 6.5, 0.16, 0.16, 6, 0, 3)} geometry={G.box}>
        <primitive object={MAT.dark} attach="material" />
      </Instances>
      <Instances count={list.length} place={head} geometry={G.box} castShadow>
        <primitive object={MAT.dark} attach="material" />
      </Instances>
      {[
        [red, 6.75],
        [amber, 6.2],
        [green, 5.65],
      ].map(([ref, y]) => (
        <instancedMesh key={y as number} ref={ref as React.RefObject<THREE.InstancedMesh>} args={[G.ball, undefined, list.length]} raycast={noRaycast} onUpdate={(m) => placeAll(m, lampPlace(y as number), list.length)}>
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      ))}
    </group>
  );
}

const dummy = new THREE.Object3D();
function placeAll(m: THREE.InstancedMesh, place: Place, n: number) {
  for (let i = 0; i < n; i++) {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    place(i, dummy);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
    m.setColorAt(i, new THREE.Color("#1a1a1a"));
  }
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.computeBoundingSphere();
}

/** A few flocks of birds wheeling over the town and the city. */
export function Birds() {
  const n = 42;
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    // A little V: two wings.
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.3, -1, 0.15, -0.2, 0, 0, -0.1, 0, 0, 0.3, 0, 0, -0.1, 1, 0.15, -0.2], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const flocks = useMemo(
    () => [
      { x: 120, z: -60, r: 70, y: 46, speed: 0.12 },
      { x: 760, z: 80, r: 110, y: 90, speed: 0.09 },
      { x: -300, z: 300, r: 90, y: 38, speed: 0.14 },
    ],
    [],
  );
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const f = flocks[i % flocks.length];
      const k = Math.floor(i / flocks.length);
      const a = t * f.speed + k * 0.09;
      const wob = Math.sin(t * 0.7 + k) * 6;
      dummy.position.set(f.x + Math.cos(a) * (f.r + wob) + Math.sin(k * 7.1) * 4, f.y + Math.sin(t * 0.9 + k * 1.3) * 3, f.z + Math.sin(a) * (f.r + wob) + Math.cos(k * 3.3) * 4);
      dummy.rotation.set(0, -a, Math.sin(t * 9 + k) * 0.5);
      dummy.scale.set(1, 1 + Math.sin(t * 12 + k * 2) * 0.6, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, n]} frustumCulled={false} raycast={noRaycast}>
      <meshStandardMaterial color="#2b2f36" side={THREE.DoubleSide} roughness={0.9} />
    </instancedMesh>
  );
}
