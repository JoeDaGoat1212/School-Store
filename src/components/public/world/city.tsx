"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BENCHES, CROWN_SPOTS, FOUNTAIN, PARK, PARK_TREES, PAVED_BLOCKS, TIERS_BY_STYLE, TOWERS, ZEBRA, ALL_TIERS } from "./city-layout";
import { noRaycast, signTexture } from "./paint";
import { pavingMaterial } from "./surfaces";
import { surface } from "./detail";
import { windowMaterial } from "./tower-facade";
import { Instances, type Place } from "./town";

/*
 * Draws the city from city-layout.ts: skyscrapers (each window style
 * is one instanced mesh, with the windows painted on by the shader, so a
 * tower of any size gets neat rows of windows), their crowns (spires,
 * antennas with blinking lights, water towers, domes, helipads), paved
 * blocks, zebra crossings, the park with its fountain, and a blimp.
 * Nothing here can be tapped.
 */

export function City() {
  return (
    <group>
      <Pavement />
      <Towers />
      <Crowns />
      <Lobbies />
      <Park />
      <Blimp />
    </group>
  );
}

// ---- Skyscrapers ------------------------------------------------------------------------------

const tierPlacer =
  (list: (typeof TIERS_BY_STYLE)[number]): Place =>
  (i, o) => {
    const { tier, color } = list[i];
    o.position.set(tier.x, (tier.y0 + tier.y1) / 2, tier.z);
    o.scale.set(tier.w, tier.y1 - tier.y0, tier.d);
    return color;
  };
const PLACE_TIERS = TIERS_BY_STYLE.map(tierPlacer);
/** A stone cornice round the top of every tier, in two steps (like the bank's). */
const placeLedge: Place = (i, o) => {
  const t = ALL_TIERS[i];
  o.position.set(t.x, t.y1 + 0.5, t.z);
  o.scale.set(t.w + 1.4, 1.4, t.d + 1.4);
};
const placeCornice: Place = (i, o) => {
  const t = ALL_TIERS[i];
  o.position.set(t.x, t.y1 + 1.4, t.z);
  o.scale.set(t.w + 2.2, 0.45, t.d + 2.2);
};
/** A band at the bottom of each set-back tier, where it sits on the one below. */
const UPPER_TIERS = ALL_TIERS.filter((t) => t.y0 > 0);
const placeBase: Place = (i, o) => {
  const t = UPPER_TIERS[i];
  o.position.set(t.x, t.y0 + 2.2, t.z);
  o.scale.set(t.w + 0.6, 1.2, t.d + 0.6);
};
/** Stone piers up each corner of every tier (in the tower's own colour), so they're not plain boxes. */
const COLORED_TIERS = TOWERS.flatMap((t) => t.tiers.map((tier) => ({ tier, color: t.color })));
const placePier: Place = (k, o) => {
  const { tier: t, color } = COLORED_TIERS[k >> 2];
  const h = t.y1 - t.y0;
  o.position.set(t.x + (k & 1 ? 1 : -1) * (t.w / 2 - 0.5), (t.y0 + t.y1) / 2, t.z + (k & 2 ? 1 : -1) * (t.d / 2 - 0.5));
  o.scale.set(2.2, h, 2.2);
  return color;
};
/** A dark granite plinth along the bottom of every tower. */
const GROUND_TIERS = ALL_TIERS.filter((t) => t.y0 === 0);
const placePlinth: Place = (i, o) => {
  const t = GROUND_TIERS[i];
  o.position.set(t.x, 0.55, t.z);
  o.scale.set(t.w + 0.9, 1.1, t.d + 0.9);
};

function Towers() {
  const materials = useMemo(() => [0, 1, 2].map((s) => windowMaterial(s as 0 | 1 | 2)), []);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  return (
    <group>
      {TIERS_BY_STYLE.map((list, s) => (
        <Instances key={s} count={list.length} place={PLACE_TIERS[s]} castShadow receiveShadow>
          <boxGeometry />
          <primitive object={materials[s]} attach="material" />
        </Instances>
      ))}
      <Instances count={COLORED_TIERS.length * 4} place={placePier} castShadow>
        <boxGeometry />
        <primitive object={surface("stone")} attach="material" />
      </Instances>
      <Instances count={ALL_TIERS.length} place={placeLedge} castShadow>
        <boxGeometry />
        <primitive object={surface("stone", "#d2c9b8", 0.85)} attach="material" />
      </Instances>
      <Instances count={ALL_TIERS.length} place={placeCornice} castShadow>
        <boxGeometry />
        <primitive object={surface("stone", "#c7bead", 0.85)} attach="material" />
      </Instances>
      <Instances count={UPPER_TIERS.length} place={placeBase}>
        <boxGeometry />
        <primitive object={surface("stone", "#bdb4a2", 0.85)} attach="material" />
      </Instances>
      <Instances count={GROUND_TIERS.length} place={placePlinth} receiveShadow>
        <boxGeometry />
        <primitive object={surface("stone", "#3d3e42", 0.55)} attach="material" />
      </Instances>
    </group>
  );
}

// ---- Tower tops -------------------------------------------------------------------------------

const darker = (hex: string, k: number) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
const only = (kind: (typeof CROWN_SPOTS)[number]["crown"]) => CROWN_SPOTS.filter((c) => c.crown === kind);
const SPIRES = only("spire");
const ANTENNAS = only("antenna");
const PYRAMIDS = only("pyramid");
const WATER = only("water");
const DOMES = only("dome");
const PADS = only("helipad");
const FLATS = only("flat");
const spireHeight = (c: (typeof CROWN_SPOTS)[number]) => 30 + c.y * 0.17;
/** Red blinking lights: on every spire and antenna tip. */
const BEACONS = [...SPIRES.map((c) => ({ x: c.x, z: c.z, y: c.y + spireHeight(c) + 1 })), ...ANTENNAS.map((c) => ({ x: c.x, z: c.z, y: c.y + 27 }))];

const placeSpire: Place = (i, o) => {
  const c = SPIRES[i];
  const r = Math.min(c.w, c.d) * 0.2;
  o.position.set(c.x, c.y + 0.9, c.z);
  o.scale.set(r, spireHeight(c), r);
  return "#e8eef5";
};
const placeSpireBase: Place = (i, o) => {
  const c = SPIRES[i];
  o.position.set(c.x, c.y + 3, c.z);
  o.scale.set(c.w * 0.5, 6, c.d * 0.5);
  return darker(c.color, 0.8);
};
const placeAntennaBase: Place = (i, o) => {
  const c = ANTENNAS[i];
  o.position.set(c.x, c.y + 2, c.z);
  o.scale.set(6, 3, 6);
};
const placeAntenna: Place = (i, o) => {
  const c = ANTENNAS[i];
  o.position.set(c.x, c.y + 14, c.z);
  o.scale.set(1, 24, 1);
};
const placePyramid: Place = (i, o) => {
  const c = PYRAMIDS[i];
  o.position.set(c.x, c.y + 1.2, c.z);
  o.scale.set(c.w / Math.SQRT2, Math.min(c.w, c.d) * 0.4, c.d / Math.SQRT2);
  return darker(c.color, 0.72);
};
const placeTank: Place = (i, o) => {
  const c = WATER[i];
  o.position.set(c.x + c.w * 0.18, c.y + 7, c.z - c.d * 0.12);
  o.scale.setScalar(1);
};
const placeTankRoof: Place = (i, o) => {
  const c = WATER[i];
  o.position.set(c.x + c.w * 0.18, c.y + 10.6, c.z - c.d * 0.12);
};
const placeTankLegs: Place = (i, o) => {
  const c = WATER[i];
  o.position.set(c.x + c.w * 0.18, c.y + 2.6, c.z - c.d * 0.12);
};
const placeDome: Place = (i, o) => {
  const c = DOMES[i];
  o.position.set(c.x, c.y + 1.2, c.z);
  o.scale.setScalar(Math.min(c.w, c.d) * 0.36);
  return i % 2 ? "#ffcf33" : darker(c.color, 0.75);
};
const placePad: Place = (i, o) => {
  const c = PADS[i];
  o.position.set(c.x, c.y + 1.4, c.z);
  const r = Math.min(c.w, c.d) * 0.4;
  o.scale.set(r, 1, r);
};
/** The "H" on each helipad: three white bars. */
const placeH: Place = (i, o) => {
  const c = PADS[Math.floor(i / 3)];
  const r = Math.min(c.w, c.d) * 0.4;
  const k = i % 3;
  o.position.set(c.x + (k === 2 ? 0 : (k ? 1 : -1) * r * 0.32), c.y + 1.75, c.z);
  o.scale.set(k === 2 ? r * 0.6 : r * 0.14, 0.1, k === 2 ? r * 0.14 : r * 0.9);
};
/** Air-conditioning boxes on the flat roofs. */
const placeVent: Place = (i, o) => {
  const c = FLATS[Math.floor(i / 3)];
  const k = i % 3;
  o.position.set(c.x + (k - 1) * c.w * 0.25, c.y + 2.6, c.z + (k === 1 ? c.d * 0.2 : -c.d * 0.15));
  o.scale.set(5, 3, 4);
};
const placeBeacon: Place = (i, o) => {
  const b = BEACONS[i];
  o.position.set(b.x, b.y, b.z);
  o.scale.setScalar(1.3);
};

function Crowns() {
  const cone = useMemo(() => new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0), []);
  const pyramid = useMemo(() => new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), []);
  const dome = useMemo(() => new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), []);
  useEffect(() => () => [cone, pyramid, dome].forEach((g) => g.dispose()), [cone, pyramid, dome]);
  const beacon = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    // Blink: on for a moment every 1.4 seconds.
    if (beacon.current) beacon.current.color.set(state.clock.elapsedTime % 1.4 < 0.5 ? "#ff3b30" : "#5a1410");
  });
  const toon = (color?: string) => <meshStandardMaterial color={color} roughness={0.78} />;
  return (
    <group>
      <Instances count={SPIRES.length} place={placeSpireBase} castShadow>
        <boxGeometry />
        {toon()}
      </Instances>
      <Instances count={SPIRES.length} place={placeSpire} geometry={cone} castShadow>
        {toon()}
      </Instances>
      <Instances count={ANTENNAS.length} place={placeAntennaBase}>
        <boxGeometry />
        {toon("#8d99a6")}
      </Instances>
      <Instances count={ANTENNAS.length} place={placeAntenna}>
        <cylinderGeometry args={[0.35, 0.5, 1, 6]} />
        {toon("#c9d1d9")}
      </Instances>
      <Instances count={PYRAMIDS.length} place={placePyramid} geometry={pyramid} castShadow>
        {toon()}
      </Instances>
      <Instances count={WATER.length} place={placeTankLegs}>
        <cylinderGeometry args={[2.6, 2.6, 5, 6, 1, true]} />
        <meshStandardMaterial color="#6b4b32" roughness={0.78} wireframe />
      </Instances>
      <Instances count={WATER.length} place={placeTank} castShadow>
        <cylinderGeometry args={[3.2, 3.2, 5.4, 14]} />
        {toon("#b5653a")}
      </Instances>
      <Instances count={WATER.length} place={placeTankRoof}>
        <coneGeometry args={[3.6, 2.2, 14]} />
        {toon("#7a3b2e")}
      </Instances>
      <Instances count={DOMES.length} place={placeDome} geometry={dome} castShadow>
        {toon()}
      </Instances>
      <Instances count={PADS.length} place={placePad}>
        <cylinderGeometry args={[1, 1, 0.7, 24]} />
        {toon("#3b4046")}
      </Instances>
      <Instances count={PADS.length * 3} place={placeH}>
        <boxGeometry />
        <meshBasicMaterial color="#ffffff" />
      </Instances>
      <Instances count={FLATS.length * 3} place={placeVent}>
        <boxGeometry />
        {toon("#b9c2cc")}
      </Instances>
      <Instances count={BEACONS.length} place={placeBeacon}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial ref={beacon} color="#ff3b30" toneMapped={false} />
      </Instances>
    </group>
  );
}

// ---- Lobby doors and awnings ------------------------------------------------------------------

const onDoor = (i: number, o: THREE.Object3D, out: number, y: number) => {
  const d = TOWERS[i].door;
  o.position.set(d.x + Math.sin(d.turn) * out, y, d.z + Math.cos(d.turn) * out);
  o.rotation.y = d.turn;
};
const placeLobbyDoor: Place = (i, o) => {
  onDoor(i, o, 0.15, 2.8);
  o.scale.set(7, 5.6, 0.4);
};
const placeAwning: Place = (i, o) => {
  onDoor(i, o, 1.6, 6.3);
  o.rotation.x = 0.18;
  o.scale.set(10, 0.45, 3.2);
  return darker(TOWERS[i].color, 0.68);
};

function Lobbies() {
  return (
    <group>
      <Instances count={TOWERS.length} place={placeLobbyDoor}>
        <boxGeometry />
        <meshStandardMaterial color="#23384a" roughness={0.2} metalness={0.4} />
      </Instances>
      <Instances count={TOWERS.length} place={placeAwning} castShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.78} />
      </Instances>
    </group>
  );
}

// ---- The ground -------------------------------------------------------------------------------

const placePaving: Place = (i, o) => {
  const b = PAVED_BLOCKS[i];
  o.position.set((b.x0 + b.x1) / 2, 0.07, (b.z0 + b.z1) / 2);
  o.scale.set(b.x1 - b.x0, 0.14, b.z1 - b.z0);
};
const placeZebra: Place = (i, o) => {
  const s = ZEBRA[i];
  o.position.set(s.x, 0.04, s.z);
  o.rotation.x = -Math.PI / 2;
  // Stripes lie along the road and are spread across it.
  if (s.alongX) o.scale.set(3.6, 1, 1);
  else o.scale.set(1, 3.6, 1);
};

function Pavement() {
  return (
    <group>
      <Instances count={PAVED_BLOCKS.length} place={placePaving} receiveShadow>
        <boxGeometry />
        <primitive object={pavingMaterial()} attach="material" />
      </Instances>
      <Instances count={ZEBRA.length} place={placeZebra}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#f4f4f0" />
      </Instances>
    </group>
  );
}

// ---- The park -----------------------------------------------------------------------------------

const GREENS = ["#4c9a3b", "#5cb045", "#3f8a35", "#69b84f"];
const placeParkTrunk: Place = (i, o) => {
  const t = PARK_TREES[i];
  o.position.set(t.x, 1.6 * t.s, t.z);
  o.scale.setScalar(t.s);
};
const placeParkLeaves: Place = (i, o) => {
  const t = PARK_TREES[i];
  o.position.set(t.x, 4.6 * t.s, t.z);
  o.scale.setScalar(2.8 * t.s);
  return GREENS[i % GREENS.length];
};
const placeSeat: Place = (i, o) => {
  const b = BENCHES[i];
  o.position.set(b.x, 0.9, b.z);
  o.rotation.y = b.turn;
  o.scale.set(3.2, 0.25, 1.1);
};
const placeBack: Place = (i, o) => {
  const b = BENCHES[i];
  o.position.set(b.x - Math.sin(b.turn) * 0.55, 1.6, b.z - Math.cos(b.turn) * 0.55);
  o.rotation.y = b.turn;
  o.scale.set(3.2, 1.1, 0.2);
};

/** Water drops arcing out of the fountain (each one loops round its arc). */
const DROPS = Array.from({ length: 48 }, (_, i) => ({ a: (i / 48) * Math.PI * 2 * 3, phase: (i * 0.37) % 1 }));
const dummy = new THREE.Object3D();

function Park() {
  const drops = useRef<THREE.InstancedMesh>(null);
  useFrame((state) => {
    const m = drops.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    DROPS.forEach((d, i) => {
      const k = (t * 0.8 + d.phase) % 1;
      const r = 0.8 + k * 4.2;
      dummy.position.set(FOUNTAIN.x + Math.cos(d.a) * r, 4.6 + k * 5 - k * k * 8, FOUNTAIN.z + Math.sin(d.a) * r);
      dummy.scale.setScalar(0.35 * (1 - k * 0.4));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  const pathW = 5;
  return (
    <group>
      {/* Paths crossing the park */}
      <mesh position={[PARK.cx, 0.06, PARK.cz]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[PARK.x1 - PARK.x0, 0.12, pathW]} />
        <meshStandardMaterial color="#e3d6b8" roughness={0.78} />
      </mesh>
      <mesh position={[PARK.cx, 0.061, PARK.cz]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[pathW, 0.12, PARK.z1 - PARK.z0]} />
        <meshStandardMaterial color="#e3d6b8" roughness={0.78} />
      </mesh>
      <mesh position={[PARK.cx, 0.07, PARK.cz]} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
        <circleGeometry args={[FOUNTAIN.r + 4, 36]} />
        <meshStandardMaterial color="#e3d6b8" roughness={0.78} />
      </mesh>
      {/* The fountain: a stone basin, water, a column and a bowl on top */}
      <group position={[FOUNTAIN.x, 0, FOUNTAIN.z]}>
        <mesh position-y={0.7} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[FOUNTAIN.r, FOUNTAIN.r + 0.3, 1.4, 36]} />
          <meshStandardMaterial color="#c9c2b6" roughness={0.78} />
        </mesh>
        <mesh position-y={1.42} raycast={noRaycast}>
          <cylinderGeometry args={[FOUNTAIN.r - 0.5, FOUNTAIN.r - 0.5, 0.1, 36]} />
          <meshStandardMaterial color="#5ec4ef" roughness={0.78} />
        </mesh>
        <mesh position-y={2.8} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[0.6, 0.9, 3, 12]} />
          <meshStandardMaterial color="#c9c2b6" roughness={0.78} />
        </mesh>
        <mesh position-y={4.3} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[2.6, 1.2, 0.8, 24]} />
          <meshStandardMaterial color="#c9c2b6" roughness={0.78} />
        </mesh>
        <mesh position-y={4.72} raycast={noRaycast}>
          <cylinderGeometry args={[2.3, 2.3, 0.08, 24]} />
          <meshStandardMaterial color="#5ec4ef" roughness={0.78} />
        </mesh>
      </group>
      <instancedMesh ref={drops} args={[undefined, undefined, DROPS.length]} raycast={noRaycast} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#9fe3ff" />
      </instancedMesh>
      <Instances count={PARK_TREES.length} place={placeParkTrunk} castShadow>
        <cylinderGeometry args={[0.35, 0.5, 3.2, 7]} />
        <meshStandardMaterial color="#8a5a35" roughness={0.78} />
      </Instances>
      <Instances count={PARK_TREES.length} place={placeParkLeaves} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.78} />
      </Instances>
      <Instances count={BENCHES.length} place={placeSeat}>
        <boxGeometry />
        <meshStandardMaterial color="#b0743f" roughness={0.78} />
      </Instances>
      <Instances count={BENCHES.length} place={placeBack}>
        <boxGeometry />
        <meshStandardMaterial color="#b0743f" roughness={0.78} />
      </Instances>
    </group>
  );
}

// ---- A blimp floating over the city -----------------------------------------------------------

function Blimp() {
  const g = useRef<THREE.Group>(null);
  const sign = useMemo(() => signTexture("Big City · Big Money!", { bg: "#ffd21f", fg: "#1b1d21", height: 128 }), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.025;
    const r = 330;
    const x = 820 + Math.cos(t) * r;
    const z = 60 + Math.sin(t) * r * 0.75;
    g.current?.position.set(x, 210 + Math.sin(t * 7) * 4, z);
    // Nose (-z) pointing the way it's going round the circle.
    if (g.current) g.current.rotation.y = Math.atan2(Math.sin(t) * r, -Math.cos(t) * r * 0.75);
  });
  const len = 34;
  const signW = Math.min(26, 6 * sign.aspect);
  return (
    <group ref={g}>
      <mesh scale={[9, 9, len / 2]} castShadow raycast={noRaycast}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color="#f2f4f7" roughness={0.78} />
      </mesh>
      {/* Tail fins */}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a) => (
        <mesh key={a} position={[Math.sin(a) * 5, Math.cos(a) * 5, len / 2 - 2]} rotation-z={-a} raycast={noRaycast}>
          <boxGeometry args={[0.5, 6, 6]} />
          <meshStandardMaterial color="#e5483b" roughness={0.78} />
        </mesh>
      ))}
      <mesh position={[0, -9.6, -2]} raycast={noRaycast}>
        <boxGeometry args={[3.4, 2.2, 8]} />
        <meshStandardMaterial color="#3d6fe0" roughness={0.78} />
      </mesh>
      {/* The sign on both sides */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 8.95, 0, 0]} rotation-y={(s * Math.PI) / 2} raycast={noRaycast}>
          <planeGeometry args={[signW, signW / sign.aspect]} />
          <meshBasicMaterial map={sign.texture} transparent toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
