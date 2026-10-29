"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BENCHES, CROWN_SPOTS, FOUNTAIN, PARK, PARK_TREES, PAVED_BLOCKS, TIERS_BY_STYLE, TOWERS, ZEBRA, ALL_TIERS } from "./city-layout";
import { noRaycast, signTexture } from "./paint";
import { Instances, type Place } from "./town";

/*
 * Draws the city from city-layout.ts: cartoon skyscrapers (each window style
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

/** The ground floor (shop windows) is this tall; the windows of the floors above start from it. */
const LOBBY = 7;

/**
 * A cartoon material that paints windows on any side of a box, in world units
 * (so big and small towers get the same size windows), with big shop windows
 * on the ground floor. Far away, the windows blend into an even colour
 * instead of shimmering.
 */
function windowMaterial(style: 0 | 1 | 2) {
  const P = [
    { cell: [3.4, 4.2], win: [0.2, 0.8, 0.24, 0.76] },
    { cell: [1000, 4.2], win: [0, 1, 0.14, 0.72] },
    { cell: [2.6, 8.4], win: [0.3, 0.7, 0.06, 0.94] },
  ][style];
  const cover = (P.win[1] - P.win[0]) * (P.win[3] - P.win[2]);
  const f = (n: number) => n.toFixed(4);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vCityPos;\nvarying vec3 vCityNormal;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vec4 cityP = vec4(transformed, 1.0);
      vec3 cityN = objectNormal;
      #ifdef USE_INSTANCING
        cityP = instanceMatrix * cityP;
        cityN = mat3(instanceMatrix) * cityN;
      #endif
      vCityPos = (modelMatrix * cityP).xyz;
      vCityNormal = normalize(mat3(modelMatrix) * cityN);`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vCityPos;
        varying vec3 vCityNormal;
        float cityHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float cityWin = 0.0;
        {
          vec3 n = normalize(vCityNormal);
          if (abs(n.y) < 0.5) {
            bool sideX = abs(n.x) > abs(n.z);
            float u = sideX ? vCityPos.z : vCityPos.x;
            float v = vCityPos.y;
            vec3 wall = diffuseColor.rgb;
            if (v < ${f(LOBBY)}) {
              float fx = fract(u / 7.0);
              float shop = step(0.1, fx) * step(fx, 0.9) * step(0.6, v) * step(v, ${f(LOBBY - 1.5)});
              diffuseColor.rgb = mix(wall * 0.8, vec3(0.3, 0.52, 0.7), shop);
              cityWin = shop;
            } else {
              vec2 cell = vec2(u / ${f(P.cell[0])}, (v - ${f(LOBBY)}) / ${f(P.cell[1])});
              vec2 g = fract(cell);
              float win = step(${f(P.win[0])}, g.x) * step(g.x, ${f(P.win[1])}) * step(${f(P.win[2])}, g.y) * step(g.y, ${f(P.win[3])});
              float blur = length(fwidth(cell));
              win = mix(win, ${f(cover)}, smoothstep(0.25, 0.75, blur));
              float r = cityHash(floor(cell) + (sideX ? vec2(31.0, 7.0) : vec2(0.0)) + floor(vCityPos.x * 0.02 + vCityPos.z * 0.013) * 3.1);
              vec3 glass = mix(vec3(0.66, 0.87, 1.0), vec3(0.4, 0.64, 0.92), fract(v * 0.0035 + r * 0.25));
              glass = mix(glass, vec3(1.0, 0.92, 0.6), step(0.94, r));
              diffuseColor.rgb = mix(wall, glass * 0.8, win);
              cityWin = win;
            }
          }
        }`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n        roughnessFactor = mix(roughnessFactor, 0.08, cityWin);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n        metalnessFactor = mix(metalnessFactor, 0.65, cityWin);");
  };
  m.customProgramCacheKey = () => `city-windows-${style}`;
  return m;
}

const tierPlacer =
  (list: (typeof TIERS_BY_STYLE)[number]): Place =>
  (i, o) => {
    const { tier, color } = list[i];
    o.position.set(tier.x, (tier.y0 + tier.y1) / 2, tier.z);
    o.scale.set(tier.w, tier.y1 - tier.y0, tier.d);
    return color;
  };
const PLACE_TIERS = TIERS_BY_STYLE.map(tierPlacer);
/** A white ledge round the top of every tier (the cartoon "outline" of the skyline). */
const placeLedge: Place = (i, o) => {
  const t = ALL_TIERS[i];
  o.position.set(t.x, t.y1 + 0.5, t.z);
  o.scale.set(t.w + 1.4, 1.4, t.d + 1.4);
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
      <Instances count={ALL_TIERS.length} place={placeLedge} castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#fff6e6" roughness={0.78} />
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
        <meshStandardMaterial color="#d8d2c6" roughness={0.78} />
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
