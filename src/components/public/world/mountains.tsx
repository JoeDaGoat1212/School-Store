"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { player } from "./bump";
import { drive } from "./drive";
import { canvasTexture, noRaycast, seededRandom } from "./paint";
import { puff } from "./smoke";
import { Near } from "./near";
import { BASE_DOOR, GRID, HILLS_START, PINES, ROAD_HALF_W, ROAD_PATH, baseDoor, groundAt, slopeAt } from "./terrain";
import { Instances, type Place } from "./town";
import { BASE, BASE_VALLEY } from "./world-map";

/*
 * The mountains to the north: the land itself (green slopes, grey rock,
 * snowy tops), pine forests, the winding mountain road with its guard rail,
 * and the hollow mountain with the secret base inside. The base's entrance
 * looks like plain rock until you drive up: a scanner sweeps you, and the
 * rock face rumbles apart to show the tunnel into the hangar.
 */

export function Mountains() {
  return (
    <group>
      <Land />
      <MountainRoad />
      <Pines />
      <Near x={BASE.x} z={BASE.z} dist={420}>
        <SecretBase />
      </Near>
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

// ---- The road up the mountain ----------------------------------------------------------------

function MountainRoad() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#45494f";
    g.fillRect(0, 0, 128, 128);
    const rand = seededRandom(23);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = i % 2 ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.06)";
      g.fillRect(rand() * 128, rand() * 128, 2, 2);
    }
    g.fillStyle = "#eeeeea";
    g.fillRect(5, 0, 4, 128);
    g.fillRect(119, 0, 4, 128);
    g.fillStyle = "#f5c33b";
    g.fillRect(60, 0, 3, 128);
    g.fillRect(65, 0, 3, 128);
    return canvasTexture(c, [1, 1]);
  }, []);
  const { road, rails, posts } = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    let along = 0;
    const railPts: THREE.Vector3[][] = [[], []];
    const postList: { x: number; y: number; z: number }[] = [];
    ROAD_PATH.forEach((p, i) => {
      const q = ROAD_PATH[Math.min(i + 1, ROAD_PATH.length - 1)];
      const o = ROAD_PATH[Math.max(i - 1, 0)];
      const dx = q.x - o.x;
      const dz = q.z - o.z;
      const len = Math.hypot(dx, dz) || 1;
      // Across the road (to its right).
      const rx = -dz / len;
      const rz = dx / len;
      if (i > 0) along += Math.hypot(p.x - ROAD_PATH[i - 1].x, p.z - ROAD_PATH[i - 1].z);
      for (const s of [-1, 1]) {
        pos.push(p.x + rx * ROAD_HALF_W * s, p.y + 0.09, p.z + rz * ROAD_HALF_W * s);
        uv.push(s < 0 ? 0 : 1, along / 10);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      // A guard rail along both edges (only up where there's a drop).
      for (const [k, s] of [
        [0, -1],
        [1, 1],
      ] as const) {
        const x = p.x + rx * (ROAD_HALF_W + 1) * s;
        const z = p.z + rz * (ROAD_HALF_W + 1) * s;
        railPts[k].push(new THREE.Vector3(x, p.y + 0.8, z));
        if (i % 3 === 0 && p.y > 4) postList.push({ x, y: p.y, z });
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    const railGeos = railPts.map((pts) => {
      const start = pts.findIndex((v) => v.y > 4.8);
      const list = start < 0 ? [] : pts.slice(start);
      return list.length > 2 ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(list), list.length * 2, 0.12, 5, false) : null;
    });
    return { road: g, rails: railGeos, posts: postList };
  }, []);
  useEffect(() => () => [road, ...rails].forEach((g) => g?.dispose()), [road, rails]);
  const placePost: Place = useMemo(
    () => (i, o) => {
      const p = posts[i];
      o.position.set(p.x, p.y + 0.45, p.z);
    },
    [posts],
  );
  return (
    <group>
      <mesh geometry={road} receiveShadow raycast={noRaycast}>
        <meshStandardMaterial map={tex} roughness={0.92} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {rails.map((g, i) =>
        g ? (
          <mesh key={i} geometry={g} castShadow raycast={noRaycast}>
            <meshStandardMaterial color="#c7ccd1" roughness={0.35} metalness={0.7} />
          </mesh>
        ) : null,
      )}
      <Instances count={posts.length} place={placePost}>
        <boxGeometry args={[0.2, 0.9, 0.2]} />
        <meshStandardMaterial color="#8a8f95" roughness={0.6} metalness={0.4} />
      </Instances>
    </group>
  );
}

// ---- Pine forests ---------------------------------------------------------------------------

const placePineTrunk: Place = (i, o) => {
  const p = PINES[i];
  o.position.set(p.x, p.y + 1.6 * p.s, p.z);
  o.scale.setScalar(p.s);
};
const pineTier =
  (k: number): Place =>
  (i, o) => {
    const p = PINES[i];
    o.position.set(p.x, p.y + (3 + k * 2.6) * p.s, p.z);
    o.scale.set(p.s * (1 - k * 0.24), p.s, p.s * (1 - k * 0.24));
    o.rotation.y = i * 1.7 + k;
    return ["#2f5a32", "#35663a", "#2a5230"][(i + k) % 3];
  };
const PINE_TIERS = [0, 1, 2].map(pineTier);

function Pines() {
  return (
    <group>
      <Instances count={PINES.length} place={placePineTrunk}>
        <cylinderGeometry args={[0.25, 0.4, 3.2, 6]} />
        <meshStandardMaterial color="#5b4030" roughness={0.9} />
      </Instances>
      {PINE_TIERS.map((place, k) => (
        <Instances key={k} count={PINES.length} place={place}>
          <coneGeometry args={[2.6, 4.2, 8]} />
          <meshStandardMaterial roughness={0.85} />
        </Instances>
      ))}
    </group>
  );
}

// ---- The secret base --------------------------------------------------------------------------

function SecretBase() {
  const floorY = BASE_VALLEY.y;
  // The hollow mountain: a lumpy dome with a hole where the entrance is.
  const dome = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 5);
    const p = g.attributes.position;
    const rand = seededRandom(5);
    const bumps = Array.from({ length: 30 }, () => new THREE.Vector3(rand() * 2 - 1, rand(), rand() * 2 - 1).normalize());
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (v.y < 0) v.y *= 0.15;
      let k = 1;
      for (const b of bumps) k += Math.max(0, v.dot(b) - 0.9) * 1.6;
      v.set(v.x * 76 * k, v.y * 92 * k, v.z * 56 * k);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    // Cut the doorway out of the front.
    const keep: number[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      const cx = (a.x + b.x + c.x) / 3;
      const cy = (a.y + b.y + c.y) / 3;
      const cz = (a.z + b.z + c.z) / 3;
      const hole = Math.abs(cx) < BASE_DOOR.halfW + 2.5 && cy < BASE_DOOR.height + 3 && cz > 20;
      if (!hole) keep.push(i, i + 1, i + 2);
    }
    const out = new THREE.BufferGeometry();
    const arr = new Float32Array(keep.length * 3);
    keep.forEach((idx, n) => {
      arr[n * 3] = p.getX(idx);
      arr[n * 3 + 1] = p.getY(idx);
      arr[n * 3 + 2] = p.getZ(idx);
    });
    out.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    out.computeVertexNormals();
    g.dispose();
    return out;
  }, []);
  useEffect(() => () => dome.dispose(), [dome]);

  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const scan = useRef<THREE.Mesh>(null);
  const lights = useRef<THREE.MeshBasicMaterial>(null);
  const state = useRef({ near: false, since: 0, dustDue: 0 });
  // The dome's front is at the door: its middle sits behind it by its depth.
  const domeZ = BASE.doorZ - 54;

  useFrame((frame, delta) => {
    const t = frame.clock.elapsedTime;
    const x = drive.active ? drive.pos.x : player.x;
    const z = drive.active ? drive.pos.z : player.z;
    const d = Math.hypot(x - BASE.x, z - BASE.doorZ);
    const s = state.current;
    const near = d < 46;
    if (near !== s.near) {
      s.near = near;
      s.since = t;
    }
    // Scanner sweeps for a second, then the rock rumbles open.
    const want = near && t - s.since > 1.1 ? 1 : near ? baseDoor.open : 0;
    const before = baseDoor.open;
    baseDoor.open = THREE.MathUtils.damp(baseDoor.open, want, 1.6, delta);
    const moving = Math.abs(baseDoor.open - before) > 0.0015;
    if (moving) {
      s.dustDue += delta * 14;
      while (s.dustDue >= 1) {
        s.dustDue -= 1;
        puff(BASE.x + (Math.random() - 0.5) * BASE_DOOR.halfW * 2, floorY + Math.random() * 2, BASE.doorZ + 2);
      }
    }
    const slide = baseDoor.open * (BASE_DOOR.halfW + 1);
    if (left.current) left.current.position.x = -BASE_DOOR.halfW / 2 - slide;
    if (right.current) right.current.position.x = BASE_DOOR.halfW / 2 + slide;
    if (scan.current) {
      scan.current.visible = near && t - s.since < 1.6;
      scan.current.position.y = floorY + 1 + ((t - s.since) % 0.8) * 12;
    }
    // The hangar lights come on as the door opens.
    lights.current?.color.setScalar(0.15 + baseDoor.open * 0.85);
  });

  const H = BASE.height;
  const W = BASE.halfW;
  const D = BASE.depth;
  const wall = "#3c4148";
  return (
    <group>
      <mesh geometry={dome} position={[BASE.x, floorY - 2, domeZ]} castShadow receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color="#7a746b" roughness={0.97} flatShading />
      </mesh>
      {/* Rocky arch round the entrance */}
      <group position={[BASE.x, floorY, BASE.doorZ + 1]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (BASE_DOOR.halfW + 3), BASE_DOOR.height / 2 + 1, 0]} castShadow raycast={noRaycast}>
            <dodecahedronGeometry args={[6, 0]} />
            <meshStandardMaterial color="#6f695f" roughness={1} flatShading />
          </mesh>
        ))}
        <mesh position={[0, BASE_DOOR.height + 3.5, 0]} scale={[2.6, 0.8, 1]} castShadow raycast={noRaycast}>
          <dodecahedronGeometry args={[6, 0]} />
          <meshStandardMaterial color="#6f695f" roughness={1} flatShading />
        </mesh>
        {/* The door: two slabs of fake rock that slide into the mountain */}
        {[left, right].map((ref, k) => (
          <group key={k} ref={ref} position-x={(k ? 1 : -1) * (BASE_DOOR.halfW / 2)}>
            <mesh position={[0, BASE_DOOR.height / 2, -0.6]} castShadow raycast={noRaycast}>
              <boxGeometry args={[BASE_DOOR.halfW, BASE_DOOR.height, 1.4]} />
              <meshStandardMaterial color="#77716a" roughness={1} />
            </mesh>
            {/* Lumps of rock glued on the outside, so it doesn't look like a door */}
            {[0, 1, 2, 3].map((j) => (
              <mesh key={j} position={[(j % 2 ? 1 : -1) * 1.8, 2 + j * 2.6, 0.4]} scale={[1.6, 1.2, 0.6]} raycast={noRaycast}>
                <dodecahedronGeometry args={[1.4, 0]} />
                <meshStandardMaterial color="#6d675f" roughness={1} flatShading />
              </mesh>
            ))}
          </group>
        ))}
        {/* The scanner: a thin green sheet of light that sweeps up and down */}
        <mesh ref={scan} position={[0, 2, 6]} rotation-x={-Math.PI / 2} visible={false} raycast={noRaycast}>
          <planeGeometry args={[BASE_DOOR.halfW * 2, 10]} />
          <meshBasicMaterial color="#38ff7a" transparent opacity={0.35} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>

      {/* ---- Inside: the tunnel and the hangar ---- */}
      <group position={[BASE.x, floorY, BASE.doorZ]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, -D / 2]} receiveShadow raycast={noRaycast}>
          <planeGeometry args={[W * 2, D + 2]} />
          <meshStandardMaterial color="#2c3036" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Yellow-and-black hazard stripe and the drop zone for loot */}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, -D * 0.62]} raycast={noRaycast}>
          <ringGeometry args={[5, 6, 40]} />
          <meshBasicMaterial color="#ffcc00" toneMapped={false} />
        </mesh>
        <mesh position={[-W, H / 2, -D / 2]} raycast={noRaycast}>
          <boxGeometry args={[0.6, H, D]} />
          <meshStandardMaterial color={wall} roughness={0.8} />
        </mesh>
        <mesh position={[W, H / 2, -D / 2]} raycast={noRaycast}>
          <boxGeometry args={[0.6, H, D]} />
          <meshStandardMaterial color={wall} roughness={0.8} />
        </mesh>
        <mesh position={[0, H / 2, -D]} raycast={noRaycast}>
          <boxGeometry args={[W * 2, H, 0.6]} />
          <meshStandardMaterial color={wall} roughness={0.8} />
        </mesh>
        <mesh position={[0, H, -D / 2]} raycast={noRaycast}>
          <boxGeometry args={[W * 2, 0.6, D]} />
          <meshStandardMaterial color="#262a30" roughness={0.9} />
        </mesh>
        {/* Front wall inside, round the doorway */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (W + BASE_DOOR.halfW) / 2, H / 2, -1.2]} raycast={noRaycast}>
            <boxGeometry args={[W - BASE_DOOR.halfW, H, 0.6]} />
            <meshStandardMaterial color={wall} roughness={0.8} />
          </mesh>
        ))}
        <mesh position={[0, (H + BASE_DOOR.height) / 2, -1.2]} raycast={noRaycast}>
          <boxGeometry args={[BASE_DOOR.halfW * 2, H - BASE_DOOR.height, 0.6]} />
          <meshStandardMaterial color={wall} roughness={0.8} />
        </mesh>
        {/* Strip lights along the ceiling */}
        {[-12, 0, 12].map((x) => (
          <mesh key={x} position={[x, H - 0.4, -D / 2]} raycast={noRaycast}>
            <boxGeometry args={[0.6, 0.2, D - 6]} />
            <meshBasicMaterial ref={x === 0 ? lights : undefined} color="#d9f2ff" toneMapped={false} />
          </mesh>
        ))}
        {/* Computer desks with glowing screens, and a big map on the back wall */}
        {[-16, -8].map((x) => (
          <group key={x} position={[x, 0, -D + 5]}>
            <mesh position-y={1.1} raycast={noRaycast}>
              <boxGeometry args={[6, 0.2, 2.4]} />
              <meshStandardMaterial color="#1f2328" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0, 0.55, 0]} raycast={noRaycast}>
              <boxGeometry args={[5.6, 1.1, 2]} />
              <meshStandardMaterial color="#2b3036" roughness={0.6} />
            </mesh>
            {[-1.6, 0, 1.6].map((sx) => (
              <mesh key={sx} position={[sx, 2.1, -0.6]} raycast={noRaycast}>
                <boxGeometry args={[1.4, 0.9, 0.08]} />
                <meshBasicMaterial color={sx === 0 ? "#29d17a" : "#2a8cff"} toneMapped={false} />
              </mesh>
            ))}
          </group>
        ))}
        <mesh position={[8, 7, -D + 0.4]} raycast={noRaycast}>
          <planeGeometry args={[22, 9]} />
          <meshBasicMaterial color="#0f2a3a" toneMapped={false} />
        </mesh>
        <mesh position={[8, 7, -D + 0.45]} raycast={noRaycast}>
          <planeGeometry args={[21, 8]} />
          <meshBasicMaterial color="#1c6c8f" wireframe toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
