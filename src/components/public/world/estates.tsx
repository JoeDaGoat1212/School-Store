"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Block, Cyl, mat } from "./buildings";
import { surface } from "./detail";
import { BroadleafTrees, Bushes, SpruceTrees, type TreeSpot } from "./nature";
import { ElmAvenue, useElms } from "./asset-models";
import { Near } from "./near";
import { noRaycast } from "./paint";
import { Static } from "./static-merge";
import { Villa } from "./villa";
import { AVENUE_LAMPS, AVENUE_TREES, ESTATE_LOTS, GARDEN, GARDEN_FOUNTAIN, GAZEBO, PARK, PARK_TREES, POND } from "./estates-layout";
import { CURB } from "./town-layout";
import { HOMES } from "./houses-layout";
import { CROSS_DRIVE, ESTATE_DRIVE } from "./world-map";

/*
 * Crescent Heights' grounds: the tree-lined avenues with lamps and flower
 * verges, Heights Park (a pond with lily pads and a jet fountain, a white
 * gazebo, a loop path, benches and flower beds), the Parterre Garden (box
 * hedge knots full of roses, gravel walks, a tiered fountain, topiary and a
 * rose pergola), a lawn of steel sculptures, and the art houses on the free
 * plots (villa.tsx).
 */

const FLOWERS = ["#e8664f", "#f2d14b", "#b48ad9", "#f4f1e6", "#e98fb0", "#ff9a3c", "#d9475f"];
const ROUND = new THREE.SphereGeometry(1, 14, 10);
const HEDGE = new THREE.MeshStandardMaterial({ color: "#2f5a2a", roughness: 0.95 });
const WATER = new THREE.MeshPhysicalMaterial({ color: "#2c6670", roughness: 0.05, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.94 });
WATER.userData.keepLook = true;

export function Estates() {
  return (
    <group>
      <Avenues />
      <Near x={(PARK.x0 + PARK.x1) / 2} z={(PARK.z0 + PARK.z1) / 2} dist={520}>
        <HeightsPark />
      </Near>
      <Near x={(GARDEN.x0 + GARDEN.x1) / 2} z={(GARDEN.z0 + GARDEN.z1) / 2} dist={520}>
        <ParterreGarden />
      </Near>
      <Sculptures />
      <GroundsTrees />
      {ESTATE_LOTS.map((l, i) => (
        <Near key={i} x={l.x} z={l.z} dist={560}>
          <group position={[l.x, 0, l.z]} rotation-y={l.turn}>
            <Villa spec={{ w: l.w, d: l.d, seed: l.seed, style: l.style, front: l.front }} />
          </group>
        </Near>
      ))}
    </group>
  );
}

// ---- The avenues -------------------------------------------------------------------------------

function Avenues() {
  // The downloaded autumn elms, once they've loaded (else the trees drawn here).
  const elms = useElms();
  const trees: TreeSpot[] = useMemo(() => AVENUE_TREES.map((t) => ({ ...t, s: t.s * 1.2 })), []);
  // Low clipped hedges and flower beds down the verges between the trees.
  const beds = useMemo(() => {
    const out: { x: number; z: number; c: string; along: "x" | "z" }[] = [];
    let n = 77;
    const rnd = () => (n = (n * 16807) % 2147483647) / 2147483647;
    for (const t of AVENUE_TREES) {
      const alongZ = Math.abs(Math.abs(t.x) - (CURB + 2.5)) < 0.5 && Math.abs(t.z - CROSS_DRIVE.z) > CURB;
      for (let k = 0; k < 5; k++) {
        const d = 3 + k * 1.9;
        out.push(alongZ ? { x: t.x + Math.sign(t.x) * 0.4, z: t.z + d, c: FLOWERS[Math.floor(rnd() * FLOWERS.length)], along: "z" } : { x: t.x + d, z: t.z, c: FLOWERS[Math.floor(rnd() * FLOWERS.length)], along: "x" });
      }
    }
    return out;
  }, []);
  const iron = mat("#1d2023", 0.45, 0.6);
  const glow = mat("#fff2d2", 0.3, 0, "#ffd98a");
  const hedges = useMemo(() => {
    const out: [number, number, number][] = [];
    for (const s of [-1, 1]) {
      const x = s * (CURB + 5.6);
      const gaps = [...HOMES.filter((h) => h.area === "estates" && Math.sign(h.site.x) === s && Math.abs(h.site.x) < 60).map((h) => h.site.z), ...ESTATE_LOTS.filter((l) => Math.sign(l.x) === s && Math.abs(l.x) < 60).map((l) => l.z)];
      for (const [a, b] of [
        [ESTATE_DRIVE.from + 8, CROSS_DRIVE.z - CURB - 6],
        [CROSS_DRIVE.z + CURB + 6, ESTATE_DRIVE.to - 20],
      ]) {
        let z = a;
        for (const g of gaps.filter((g) => g > a && g < b).sort((p, q) => p - q)) {
          if (g - 4 > z) out.push([x, z, g - 4]);
          z = g + 4;
        }
        if (b > z) out.push([x, z, b]);
      }
    }
    return out;
  }, []);
  return (
    <group>
      {!elms && <BroadleafTrees list={trees} />}
      <ElmAvenue spots={trees} />
      <Static>
        {beds.map((b, i) => (
          <mesh key={i} geometry={ROUND} material={mat(b.c, 0.7)} position={[b.x, 0.32, b.z]} scale={[0.75, 0.38, 0.75]} raycast={noRaycast} />
        ))}
        {/* Hedge borders behind the verges, down the main drive (with gaps for each house's front path) */}
        {hedges.map(([x, z0, z1], i) => (
          <Block key={`hg${i}`} x0={x - 0.5} x1={x + 0.5} y0={0} y1={1.0} z0={z0} z1={z1} m={HEDGE} />
        ))}
        {AVENUE_LAMPS.map((l, i) => (
          <group key={`l${i}`} position={[l.x, 0, l.z]} rotation-y={l.turn}>
            <Cyl x={0} y={0.3} z={0} r={0.22} h={0.6} m={iron} />
            <Cyl x={0} y={2.6} z={0} r={0.08} h={4.4} m={iron} />
            <Block x0={-0.05} x1={0.05} y0={4.6} y1={4.7} z0={-1.1} z1={0} m={iron} />
            <mesh geometry={ROUND} material={glow} position={[0, 4.4, -1.1]} scale={[0.28, 0.36, 0.28]} raycast={noRaycast} />
            <Block x0={-0.3} x1={0.3} y0={4.72} y1={4.82} z0={-1.4} z1={-0.8} m={iron} />
          </group>
        ))}
      </Static>
    </group>
  );
}

// ---- Heights Park --------------------------------------------------------------------------------

function ringPath(e: typeof POND, q: number, half: number) {
  const pts = 120;
  const pos: number[] = [];
  const idx: number[] = [];
  const c = Math.cos(e.turn);
  const s = Math.sin(e.turn);
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    for (const k of [-1, 1]) {
      const u = Math.cos(a) * (e.rx * q + k * half);
      const v = Math.sin(a) * (e.rz * q + k * half);
      pos.push(e.x + u * c + v * s, 0.05, e.z - u * s + v * c);
    }
    if (i < pts) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) g.index!.array.reverse();
  g.computeVertexNormals();
  return g;
}

function HeightsPark() {
  const gravel = surface("concrete", "#d8cdb8", 0.95);
  const stone = surface("stone", "#cfc6b4", 0.85);
  const white = mat("#f6f3ec", 0.5);
  const roof = mat("#3a5a48", 0.5, 0.3);
  const wood = surface("planks", "#7d593c", 0.85);
  const iron = mat("#1d2023", 0.45, 0.6);
  const path = useMemo(() => ringPath(POND, 1.32, 1.6), []);
  const shore = useMemo(() => ringPath(POND, 1.03, 0.9), []);
  const pads = useMemo(() => {
    const out: { x: number; z: number; s: number; r: number; f: boolean }[] = [];
    let n = 5;
    const rnd = () => (n = (n * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const q = 0.6 + rnd() * 0.33;
      const u = Math.cos(a) * POND.rx * q;
      const v = Math.sin(a) * POND.rz * q;
      out.push({ x: POND.x + u * Math.cos(POND.turn) + v * Math.sin(POND.turn), z: POND.z - u * Math.sin(POND.turn) + v * Math.cos(POND.turn), s: 0.6 + rnd() * 0.7, r: rnd() * 6, f: rnd() < 0.3 });
    }
    return out;
  }, []);
  const jet = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (jet.current) jet.current.scale.y = 1 + Math.sin(s.clock.elapsedTime * 2.6) * 0.08;
  });
  const beds = useMemo(() => {
    const out: { x: number; z: number; c: string }[] = [];
    let n = 9;
    const rnd = () => (n = (n * 16807) % 2147483647) / 2147483647;
    for (const [cx, cz] of [
      [PARK.x0 + 20, PARK.z0 + 18],
      [PARK.x1 - 20, PARK.z0 + 18],
      [PARK.x0 + 22, PARK.z1 - 16],
      [PARK.x1 - 22, PARK.z1 - 16],
    ])
      for (let k = 0; k < 40; k++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * 7;
        out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, c: FLOWERS[(k + Math.floor(r)) % FLOWERS.length] });
      }
    return out;
  }, []);
  const benches = useMemo(() => {
    const out: { x: number; z: number; turn: number }[] = [];
    for (let a = 0.4; a < Math.PI * 2; a += 0.9) {
      const q = 1.32 + 0.2;
      const u = Math.cos(a) * POND.rx * q;
      const v = Math.sin(a) * POND.rz * q;
      const x = POND.x + u * Math.cos(POND.turn) + v * Math.sin(POND.turn);
      const z = POND.z - u * Math.sin(POND.turn) + v * Math.cos(POND.turn);
      out.push({ x, z, turn: Math.atan2(POND.x - x, POND.z - z) });
    }
    return out;
  }, []);
  const shrubs = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const a = (i / 30) * Math.PI * 2 + 0.1;
        const q = 1.12;
        const u = Math.cos(a) * POND.rx * q;
        const v = Math.sin(a) * POND.rz * q;
        return { x: POND.x + u * Math.cos(POND.turn) + v * Math.sin(POND.turn), z: POND.z - u * Math.sin(POND.turn) + v * Math.cos(POND.turn), s: 0.7 + (i % 3) * 0.2 };
      }).filter((_, i) => i % 4 !== 1),
    [],
  );
  const G = GAZEBO;
  return (
    <group>
      <mesh position={[POND.x, 0.02, POND.z]} rotation-y={POND.turn} material={WATER} raycast={noRaycast}>
        <primitive object={new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2).scale(POND.rx, 1, POND.rz)} attach="geometry" />
      </mesh>
      <Static>
        <mesh geometry={path} material={gravel} receiveShadow raycast={noRaycast} />
        <mesh geometry={shore} material={stone} receiveShadow raycast={noRaycast} />
        {/* A path across the park from the drive to the gazebo */}
        <Block x0={PARK.x0 - 10} x1={G.x} y0={0.03} y1={0.06} z0={G.z - 1.4} z1={G.z + 1.4} m={gravel} />
        {/* The gazebo: eight white columns, a rail, and a domed roof */}
        <Cyl x={G.x} y={0.3} z={G.z} r={G.r + 0.6} h={0.6} m={stone} />
        {Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2).map((a) => (
          <group key={a}>
            <Cyl x={G.x + Math.cos(a) * G.r} y={2.6} z={G.z + Math.sin(a) * G.r} r={0.22} h={4} m={white} />
            {Math.abs(a - Math.PI * 1.5) > 0.3 && (
              <group position={[G.x + Math.cos(a + Math.PI / 8) * G.r * 0.93, 1.3, G.z + Math.sin(a + Math.PI / 8) * G.r * 0.93]} rotation-y={-(a + Math.PI / 8) + Math.PI / 2}>
                <Block x0={-2} x1={2} y0={0} y1={0.1} z0={-0.06} z1={0.06} m={white} />
                <Block x0={-2} x1={2} y0={-0.7} y1={-0.62} z0={-0.05} z1={0.05} m={white} />
              </group>
            )}
          </group>
        ))}
        <Cyl x={G.x} y={4.75} z={G.z} r={G.r + 0.5} h={0.3} m={white} />
        <mesh position={[G.x, 4.9, G.z]} material={roof} scale={[G.r + 0.8, 3, G.r + 0.8]} castShadow raycast={noRaycast}>
          <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh geometry={ROUND} material={mat("#c8a24a", 0.3, 0.8)} position={[G.x, 8.1, G.z]} scale={0.35} raycast={noRaycast} />
        {/* The fountain jet's base */}
        <Cyl x={POND.x} y={0.1} z={POND.z} r={1.2} h={0.3} m={stone} />
        {/* Benches round the path */}
        {benches.map((b, i) => (
          <group key={`b${i}`} position={[b.x, 0, b.z]} rotation-y={b.turn}>
            <Block x0={-1.2} x1={1.2} y0={0.5} y1={0.6} z0={-0.35} z1={0.35} m={wood} />
            <Block x0={-1.2} x1={1.2} y0={0.6} y1={1.2} z0={-0.42} z1={-0.34} m={wood} />
            <Block x0={-1.1} x1={-0.95} y0={0} y1={0.5} z0={-0.3} z1={0.3} m={iron} />
            <Block x0={0.95} x1={1.1} y0={0} y1={0.5} z0={-0.3} z1={0.3} m={iron} />
          </group>
        ))}
        {beds.map((b, i) => (
          <mesh key={`f${i}`} geometry={ROUND} material={mat(b.c, 0.7)} position={[b.x, 0.3, b.z]} scale={[0.7, 0.36, 0.7]} raycast={noRaycast} />
        ))}
        {pads.map((p, i) => (
          <group key={`p${i}`} position={[p.x, 0.05, p.z]} rotation-y={p.r}>
            <mesh rotation-x={-Math.PI / 2} material={mat("#3f6b2c", 0.6)} scale={p.s} raycast={noRaycast}>
              <circleGeometry args={[1, 14, 0.4, Math.PI * 2 - 0.4]} />
            </mesh>
            {p.f && <mesh geometry={ROUND} material={mat("#f3c6d8", 0.5)} position-y={0.12} scale={[0.28, 0.16, 0.28]} raycast={noRaycast} />}
          </group>
        ))}
      </Static>
      <group ref={jet} position={[POND.x, 0, POND.z]}>
        <mesh position-y={4} raycast={noRaycast}>
          <cylinderGeometry args={[0.15, 0.5, 8, 10, 1, true]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.45} depthWrite={false} />
        </mesh>
        <mesh position-y={2} raycast={noRaycast}>
          <cylinderGeometry args={[0.6, 2.4, 4, 16, 1, true]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </group>
      <Bushes list={shrubs} />
    </group>
  );
}

// ---- The Parterre Garden --------------------------------------------------------------------------

function ParterreGarden() {
  const gravel = surface("concrete", "#e2d8c4", 0.95);
  const stone = surface("stone", "#d8cfbd", 0.85);
  const white = mat("#f6f3ec", 0.5);
  const wood = surface("planks", "#f0ece3", 0.7);
  const leaf = mat("#3d6b33", 0.9);
  const F = GARDEN_FOUNTAIN;
  const cx = F.x;
  const cz = F.z;
  // Four knot beds (box-hedge borders with a diamond inside, roses in between).
  const quads = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  const roses = useMemo(() => {
    const out: { x: number; z: number; c: string }[] = [];
    let n = 31;
    const rnd = () => (n = (n * 16807) % 2147483647) / 2147483647;
    quads.forEach(([sx, sz], q) => {
      const qx = cx + sx * 26;
      const qz = cz + sz * 18;
      for (let k = 0; k < 70; k++) {
        const x = qx + (rnd() - 0.5) * 30;
        const z = qz + (rnd() - 0.5) * 20;
        if (Math.abs(x - qx) / 15 + Math.abs(z - qz) / 10 < 0.62) continue;
        out.push({ x, z, c: ["#d9475f", "#f4f1e6", "#e98fb0", "#f2d14b"][(q + k) % 4] });
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ripple = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (ripple.current) ripple.current.rotation.y = s.clock.elapsedTime * 0.1;
  });
  return (
    <group>
      <Static>
        {/* Gravel walks: the cross, and round the edge */}
        <Block x0={GARDEN.x0 + 4} x1={GARDEN.x1 - 4} y0={0.03} y1={0.06} z0={cz - 2.5} z1={cz + 2.5} m={gravel} />
        <Block x0={cx - 2.5} x1={cx + 2.5} y0={0.03} y1={0.06} z0={GARDEN.z0 + 4} z1={GARDEN.z1 - 4} m={gravel} />
        <Block x0={GARDEN.x1 - 4} x1={-CURB + 0.5} y0={0.03} y1={0.06} z0={cz - 2.5} z1={cz + 2.5} m={gravel} />
        {/* Knot beds */}
        {quads.map(([sx, sz]) => {
          const qx = cx + sx * 26;
          const qz = cz + sz * 18;
          return (
            <group key={`${sx}${sz}`}>
              <Block x0={qx - 15} x1={qx + 15} y0={0} y1={0.7} z0={qz - 10} z1={qz - 9.3} m={HEDGE} cast />
              <Block x0={qx - 15} x1={qx + 15} y0={0} y1={0.7} z0={qz + 9.3} z1={qz + 10} m={HEDGE} cast />
              <Block x0={qx - 15} x1={qx - 14.3} y0={0} y1={0.7} z0={qz - 10} z1={qz + 10} m={HEDGE} cast />
              <Block x0={qx + 14.3} x1={qx + 15} y0={0} y1={0.7} z0={qz - 10} z1={qz + 10} m={HEDGE} cast />
              {/* The diamond */}
              {[0, 1, 2, 3].map((k) => {
                const a = (k * Math.PI) / 2;
                const len = Math.hypot(15, 10) * 0.62;
                const ex = Math.cos(a) * 15 * 0.62;
                const ez = Math.sin(a) * 10 * 0.62;
                const nx = Math.cos(a + Math.PI / 2) * 15 * 0.62;
                const nz = Math.sin(a + Math.PI / 2) * 10 * 0.62;
                return (
                  <mesh key={k} position={[qx + (ex + nx) / 2, 0.35, qz + (ez + nz) / 2]} rotation-y={-Math.atan2(nz - ez, nx - ex)} material={HEDGE} castShadow raycast={noRaycast}>
                    <boxGeometry args={[len * 0.98, 0.7, 0.7]} />
                  </mesh>
                );
              })}
              {/* A topiary cone in the middle */}
              <mesh position={[qx, 1.8, qz]} material={HEDGE} castShadow raycast={noRaycast}>
                <coneGeometry args={[1.2, 3.6, 16]} />
              </mesh>
              <Block x0={qx - 1.4} x1={qx + 1.4} y0={0} y1={0.25} z0={qz - 1.4} z1={qz + 1.4} m={stone} />
            </group>
          );
        })}
        {roses.map((r, i) => (
          <mesh key={i} geometry={ROUND} material={mat(r.c, 0.7)} position={[r.x, 0.35, r.z]} scale={[0.55, 0.4, 0.55]} raycast={noRaycast} />
        ))}
        {/* The tiered fountain */}
        <Cyl x={cx} y={0.4} z={cz} r={F.r} h={0.8} m={stone} />
        <Cyl x={cx} y={1.8} z={cz} r={0.6} h={2.4} m={stone} />
        <Cyl x={cx} y={3.0} z={cz} r={2.8} h={0.35} m={stone} />
        <Cyl x={cx} y={4.1} z={cz} r={0.35} h={1.8} m={stone} />
        <Cyl x={cx} y={5.0} z={cz} r={1.4} h={0.25} m={stone} />
        <mesh geometry={ROUND} material={mat("#c8a24a", 0.3, 0.8)} position={[cx, 5.6, cz]} scale={0.5} raycast={noRaycast} />
        {/* A rose pergola along the far side */}
        {Array.from({ length: 14 }, (_, i) => GARDEN.x0 + 20 + i * 12).map((x) => (
          <group key={`pg${x}`}>
            {[-1.8, 1.8].map((dz) => (
              <Cyl key={dz} x={x} y={1.7} z={GARDEN.z1 - 12 + dz} r={0.18} h={3.4} m={white} />
            ))}
            <Block x0={x - 0.12} x1={x + 0.12} y0={3.4} y1={3.65} z0={GARDEN.z1 - 14.5} z1={GARDEN.z1 - 9.5} m={wood} />
            {[0, 2.4, 4.8, 7.2, 9.6].map((dx, k) => (
              <mesh key={`lf${k}`} geometry={ROUND} material={leaf} position={[x + dx, 3.55 + (k % 2) * 0.15, GARDEN.z1 - 12 + ((k * 7) % 3) - 1]} scale={[1.6, 0.75, 1.5]} raycast={noRaycast} />
            ))}
            {[1.2, 6, 8.4].map((dx, k) => (
              <mesh key={`rs${k}`} geometry={ROUND} material={mat(k % 2 ? "#f4f1e6" : "#e98fb0", 0.7)} position={[x + dx, 4.05, GARDEN.z1 - 11.4 - k * 0.5]} scale={[0.45, 0.32, 0.45]} raycast={noRaycast} />
            ))}
            {/* Climbing roses up the posts */}
            <mesh geometry={ROUND} material={leaf} position={[x, 1.6, GARDEN.z1 - 10.2]} scale={[0.5, 1.6, 0.5]} raycast={noRaycast} />
          </group>
        ))}
        {[-1.8, 1.8].map((dz) => (
          <Block key={`pb${dz}`} x0={GARDEN.x0 + 19} x1={GARDEN.x0 + 20 + 13 * 12 + 1} y0={3.3} y1={3.45} z0={GARDEN.z1 - 12 + dz - 0.1} z1={GARDEN.z1 - 12 + dz + 0.1} m={wood} />
        ))}
        {/* Classical urns on plinths at the crossings */}
        {[
          [cx - 50, cz],
          [cx + 50, cz],
          [cx, cz - 34],
          [cx, cz + 34],
        ].map(([x, z]) => (
          <group key={`u${x}${z}`} position={[x, 0, z]}>
            <Block x0={-0.8} x1={0.8} y0={0} y1={1.4} z0={-0.8} z1={0.8} m={stone} />
            <mesh geometry={ROUND} material={white} position-y={2.1} scale={[0.75, 0.65, 0.75]} raycast={noRaycast} />
            <mesh geometry={ROUND} material={mat("#d9475f", 0.7)} position-y={2.9} scale={[0.7, 0.4, 0.7]} raycast={noRaycast} />
          </group>
        ))}
      </Static>
      <mesh ref={ripple} position={[cx, 0.79, cz]} material={WATER} raycast={noRaycast}>
        <cylinderGeometry args={[F.r - 0.35, F.r - 0.35, 0.04, 40]} />
      </mesh>
      <mesh position={[cx, 3.2, cz]} material={WATER} raycast={noRaycast}>
        <cylinderGeometry args={[2.5, 2.5, 0.04, 32]} />
      </mesh>
    </group>
  );
}

// ---- Sculptures --------------------------------------------------------------------------------------

/** A lawn of polished steel sculptures by the gate: a ring, a twisted knot, a stack of stones and a tall arc. */
function Sculptures() {
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e4e7ea", roughness: 0.08, metalness: 1 }), []);
  const bronze = useMemo(() => new THREE.MeshStandardMaterial({ color: "#a8743a", roughness: 0.35, metalness: 0.9 }), []);
  const stone = surface("stone", "#cfc6b4", 0.85);
  const knot = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (knot.current) knot.current.rotation.y = s.clock.elapsedTime * 0.15;
  });
  const base = { x: 36, z: 606 };
  return (
    <Near x={base.x} z={base.z} dist={420}>
      <group position={[base.x, 0, base.z]}>
        <Block x0={-3} x1={3} y0={0} y1={0.6} z0={-3} z1={3} m={stone} />
        <mesh position-y={5.2} material={steel} castShadow raycast={noRaycast}>
          <torusGeometry args={[4.2, 0.5, 24, 64]} />
        </mesh>
        <group position={[18, 0, 4]}>
          <Block x0={-2} x1={2} y0={0} y1={0.8} z0={-2} z1={2} m={stone} />
          <mesh ref={knot} position-y={4} material={bronze} castShadow raycast={noRaycast}>
            <torusKnotGeometry args={[1.8, 0.45, 160, 20, 2, 3]} />
          </mesh>
        </group>
        <group position={[34, 0, -2]}>
          {[2.2, 1.7, 1.25, 0.8].map((r, i, a) => (
            <mesh key={i} geometry={ROUND} material={i % 2 ? steel : stone} position-y={a.slice(0, i).reduce((s, x) => s + x * 1.1, 0) + r * 0.55} scale={[r, r * 0.55, r * 0.9]} castShadow raycast={noRaycast} />
          ))}
        </group>
        <mesh position={[52, 0, 2]} rotation-y={0.4} material={steel} castShadow raycast={noRaycast}>
          <torusGeometry args={[7, 0.35, 16, 64, Math.PI]} />
        </mesh>
      </group>
    </Near>
  );
}

function GroundsTrees() {
  const { broad, spruce } = useMemo(() => {
    const broad: TreeSpot[] = [];
    const spruce: TreeSpot[] = [];
    for (const t of PARK_TREES) (t.kind ? spruce : broad).push({ x: t.x, z: t.z, s: t.s * 1.2 });
    return { broad, spruce };
  }, []);
  return (
    <group>
      <BroadleafTrees list={broad} />
      <SpruceTrees list={spruce} />
    </group>
  );
}
