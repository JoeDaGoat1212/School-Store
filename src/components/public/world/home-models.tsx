"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { player } from "./bump";
import { Block, Cyl, GLASS, mat, useDrawn } from "./buildings";
import { drive } from "./drive";
import { HOMES, ESTATE_WALL, access, doorOpenFor, homePlan, ownsHome, type Home } from "./houses-layout";
import { Humanoid, newPose, randomLook } from "./humanoid";
import { Near, show } from "./near";
import { Static } from "./static-merge";
import { noRaycast, signTexture } from "./paint";
import { usd } from "./profile";

/*
 * The homes for sale (houses-layout.ts has the numbers), each in its own
 * style: a shuttered cottage, a porch bungalow, a craftsman, a modern box, a
 * brick colonial, a timber A-frame, and in Crescent Heights a Spanish villa,
 * a glass house, a Tuscan estate with a tower, a stacked contemporary, a
 * French château with turrets and the white-marble Crescent Crown. The
 * ground floor is furnished (living room, kitchen, bedroom) and you can walk
 * in once it's yours. Plus Crescent Heights' stone wall, gatehouse, guard
 * and barriers.
 */

const BOX = new THREE.BoxGeometry(1, 1, 1);

function gable(W: number, D: number, rise: number) {
  const s = new THREE.Shape();
  s.moveTo(-W, 0);
  s.lineTo(0, rise);
  s.lineTo(W, 0);
  s.lineTo(-W, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false });
  g.translate(0, 0, -D);
  return g;
}

/** A pitched roof along the house (gable), or a flat one with a parapet. */
function Roof({ kind, W, D, y, rise, color }: { kind: "gable" | "flat"; W: number; D: number; y: number; rise: number; color: string }) {
  const geo = useMemo(() => (kind === "gable" ? gable(W + 0.6, D + 1.2, rise) : null), [kind, W, D, rise]);
  const m = mat(color, 0.8);
  if (!geo)
    return (
      <group>
        <Block x0={-W - 0.2} x1={W + 0.2} y0={y} y1={y + 0.35} z0={-D - 0.2} z1={0.2} m={m} cast />
        <Block x0={-W - 0.2} x1={W + 0.2} y0={y + 0.35} y1={y + 0.9} z0={0} z1={0.2} m={m} />
      </group>
    );
  return <mesh geometry={geo} material={m} position={[0, y, 0.6]} castShadow raycast={noRaycast} />;
}

/** The hip roof needs scaling to the house's footprint (a cone's base is a square turned 45°). */
function Hip({ W, D, y, rise, color, flatTop = false }: { W: number; D: number; y: number; rise: number; color: string; flatTop?: boolean }) {
  return (
    <group position={[0, y + rise / 2, -D / 2]} scale={[(W + 0.7) * 2, rise, D + 1.4]}>
      <mesh rotation-y={Math.PI / 4} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[flatTop ? 0.4 : 0, Math.SQRT1_2, 1, 4, 1]} />
        <meshStandardMaterial color={color} roughness={0.8} flatShading />
      </mesh>
    </group>
  );
}

function Window({ x, y, z, w, h, side = 0, trim }: { x: number; y: number; z: number; w: number; h: number; side?: number; trim: string }) {
  return (
    <group position={[x, y, z]} rotation-y={side}>
      <mesh geometry={BOX} material={mat("#7fa9c4", 0.08, 0.7)} scale={[w, h, 0.06]} raycast={noRaycast} />
      <mesh geometry={BOX} material={mat(trim, 0.5)} position-y={-h / 2 - 0.06} scale={[w + 0.3, 0.14, 0.2]} raycast={noRaycast} />
      <mesh geometry={BOX} material={mat(trim, 0.5)} position-y={h / 2 + 0.05} scale={[w + 0.2, 0.1, 0.12]} raycast={noRaycast} />
      <mesh geometry={BOX} material={mat(trim, 0.5)} scale={[0.08, h, 0.1]} raycast={noRaycast} />
    </group>
  );
}

/** The front door: swings open when it's yours (or you're on a tour) and you walk up. */
function FrontDoor({ h }: { h: Home }) {
  const P = homePlan(h);
  const g = useRef<THREE.Group>(null);
  const open = useRef(0);
  const at = useMemo(() => ({ x: h.site.x, z: h.site.z }), [h]);
  useFrame((_, dt) => {
    const x = drive.active ? drive.pos.x : player.x;
    const z = drive.active ? drive.pos.z : player.z;
    const want = doorOpenFor(h) && (Math.hypot(x - at.x, z - at.z) < 7 || access.touring === h.id);
    open.current = THREE.MathUtils.damp(open.current, want ? 1 : 0, 5, dt);
    if (g.current) g.current.rotation.y = open.current * 1.7;
  });
  const half = P.doorHalf;
  const H = 2.9;
  return (
    <group ref={g} position={[-half, 0, -0.2]}>
      {half > 1.6 ? (
        <>
          <Block x0={0} x1={half} y0={0} y1={H} z0={-0.06} z1={0.06} m={mat(h.trim, 0.4)} />
          <Block x0={0.2} x1={half - 0.2} y0={0.3} y1={H - 0.3} z0={0.06} z1={0.1} m={GLASS} />
        </>
      ) : (
        <Block x0={0} x1={half * 2} y0={0} y1={H} z0={-0.06} z1={0.06} m={mat(h.trim === "#ffffff" || h.trim === "#f2f0ea" ? "#2d6a4f" : h.trim, 0.4)} />
      )}
      <mesh position={[half * 2 - 0.25, 1.3, 0.12]} raycast={noRaycast}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshStandardMaterial color="#d4a017" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

/** The ground floor's furniture. */
function Interior({ h }: { h: Home }) {
  const P = homePlan(h);
  const rich = h.price > 1e6;
  const wood = mat(rich ? "#6b4329" : "#a87a45", 0.6);
  const fabric = mat(rich ? "#2a3442" : ["#c0392b", "#3d6fe0", "#90be6d", "#7b5cd6"][h.beds % 4], 0.95);
  const white = mat("#f4f1ea", 0.5);
  const stone = mat(rich ? "#e9e4da" : "#d0c8bb", 0.2, 0.1);
  const L = P.living;
  const K = P.kitchen;
  const B = P.bedroom;
  const s = Math.min(1.6, 0.8 + h.w / 60);
  return (
    <group>
      {/* Floors (wood in front, tiles in the kitchen) */}
      <mesh position={[0, 0.05, P.midZ / 2]} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[P.W * 2 - 0.2, -P.midZ - 0.3]} />
        <meshStandardMaterial color={rich ? "#8b5a3c" : "#c49a6c"} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.05, (P.midZ - P.D) / 2]} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[P.W * 2 - 0.2, P.D + P.midZ - 0.3]} />
        <meshStandardMaterial color={rich ? "#f2efe8" : "#e6dccb"} roughness={0.3} />
      </mesh>
      {/* Living room: rug, sofa, coffee table, TV, lamp */}
      <mesh position={[L.lx, 0.07, L.lz]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[4.2 * s, 3 * s]} />
        <meshStandardMaterial color={rich ? "#c9b48a" : "#e9d8b4"} roughness={1} />
      </mesh>
      <group position={[L.lx, 0, L.lz - 1.8 * s]}>
        <Block x0={-1.8 * s} x1={1.8 * s} y0={0} y1={0.8} z0={-0.5} z1={0.5} m={fabric} cast />
        <Block x0={-1.8 * s} x1={1.8 * s} y0={0.8} y1={1.7} z0={-0.5} z1={-0.15} m={fabric} />
        <Block x0={-1.9 * s} x1={-1.6 * s} y0={0} y1={1.1} z0={-0.5} z1={0.5} m={fabric} />
        <Block x0={1.6 * s} x1={1.9 * s} y0={0} y1={1.1} z0={-0.5} z1={0.5} m={fabric} />
      </group>
      <Block x0={L.lx - 1} x1={L.lx + 1} y0={0} y1={0.55} z0={L.lz - 0.4} z1={L.lz + 0.4} m={wood} />
      <group position={[L.lx, 0, Math.min(-0.6, L.lz + 2.4 * s)]}>
        <Block x0={-1.5} x1={1.5} y0={0} y1={0.7} z0={-0.3} z1={0.3} m={wood} />
        <Block x0={-1.3} x1={1.3} y0={0.95} y1={2.4} z0={-0.05} z1={0.05} m={mat("#111317", 0.15, 0.4, "#13253a")} />
      </group>
      <Cyl x={P.W - 1.2} y={1.2} z={L.lz} r={0.05} h={2.4} m={mat("#2b2f36", 0.4, 0.7)} />
      <mesh position={[P.W - 1.2, 2.5, L.lz]} raycast={noRaycast}>
        <cylinderGeometry args={[0.25, 0.4, 0.5, 14, 1, true]} />
        <meshStandardMaterial color="#fff6e0" emissive="#ffd9a0" emissiveIntensity={0.8} side={THREE.DoubleSide} />
      </mesh>
      {/* Stairs up (two floors or more) */}
      {h.floors > 1 &&
        Array.from({ length: 8 }, (_, i) => (
          <Block key={i} x0={-P.W + 0.5} x1={-P.W + 2.1} y0={0} y1={(i + 1) * (h.storey / 8)} z0={P.midZ + 0.4 + i * 0.5} z1={P.midZ + 0.9 + i * 0.5} m={wood} />
        ))}
      {/* Kitchen: counters along the back wall, the island, the fridge */}
      <Block x0={-P.W + 0.4} x1={-0.6} y0={0} y1={1.4} z0={-P.D + 0.4} z1={-P.D + 1.4} m={white} cast />
      <Block x0={-P.W + 0.4} x1={-0.6} y0={1.4} y1={1.5} z0={-P.D + 0.4} z1={-P.D + 1.5} m={stone} />
      <Block x0={K.lx - 1.6} x1={K.lx + 1.6} y0={0} y1={1.4} z0={K.lz - 0.8} z1={K.lz + 0.8} m={rich ? mat("#1b1d21", 0.4) : white} cast />
      <Block x0={K.lx - 1.7} x1={K.lx + 1.7} y0={1.4} y1={1.5} z0={K.lz - 0.9} z1={K.lz + 0.9} m={stone} />
      <Block x0={-P.W + 0.4} x1={-P.W + 1.6} y0={0} y1={3} z0={P.midZ - 2} z1={P.midZ - 0.8} m={mat("#c9ced4", 0.25, 0.85)} />
      {[-0.8, 0.8].map((x) => (
        <Cyl key={x} x={K.lx + x} y={1} z={K.lz + 1.3} r={0.3} h={0.08} m={fabric} />
      ))}
      {/* Bedroom: the bed, nightstands, a wardrobe */}
      <group position={[B.lx, 0, B.lz]}>
        <Block x0={-1.4} x1={1.4} y0={0} y1={0.7} z0={-2.2} z1={1} m={wood} />
        <Block x0={-1.35} x1={1.35} y0={0.7} y1={1.05} z0={-2.15} z1={0.95} m={white} />
        <Block x0={-1.36} x1={1.36} y0={1.05} y1={1.12} z0={-1.2} z1={0.96} m={fabric} />
        <Block x0={-1.1} x1={-0.15} y0={1.05} y1={1.35} z0={-2} z1={-1.5} m={white} />
        <Block x0={0.15} x1={1.1} y0={1.05} y1={1.35} z0={-2} z1={-1.5} m={white} />
        <Block x0={-1.4} x1={1.4} y0={0} y1={2.2} z0={-2.4} z1={-2.2} m={wood} />
        {[-1, 1].map((sx) => (
          <Block key={sx} x0={sx * 1.5 - 0.35} x1={sx * 1.5 + 0.35} y0={0} y1={0.8} z0={-2.1} z1={-1.5} m={wood} />
        ))}
      </group>
      <Block x0={P.W - 1} x1={P.W - 0.4} y0={0} y1={3} z0={P.midZ - 4} z1={P.midZ - 1} m={wood} />
      {/* Ceiling lights */}
      {[L, K, B].map((p, i) => (
        <mesh key={i} position={[p.lx, h.storey - 0.1, p.lz]} rotation-x={Math.PI / 2} raycast={noRaycast}>
          <circleGeometry args={[0.6, 20]} />
          <meshStandardMaterial color="#ffffff" emissive="#fff3d6" emissiveIntensity={1.4} />
        </mesh>
      ))}
      {rich && (
        <group position={[L.lx, h.storey - 1.2, L.lz]}>
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={i} position={[Math.cos(i * 0.785) * 0.9, 0, Math.sin(i * 0.785) * 0.9]} raycast={noRaycast}>
              <sphereGeometry args={[0.14, 8, 6]} />
              <meshStandardMaterial color="#fff6e0" emissive="#ffe2a8" emissiveIntensity={1.2} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/** The outside of the house above the ground floor, and its roof, by style. */
function Upper({ h }: { h: Home }) {
  const P = homePlan(h);
  const W = P.W;
  const D = P.D;
  const S = h.storey;
  const up = (h.floors - 1) * S;
  const wall = mat(h.wall, 0.85);
  const trim = mat(h.trim, 0.5);
  const top = h.floors * S;
  const aFrame = useMemo(() => gable(W + 2, D + 1.5, S * 2.4), [W, D, S]);
  const aGlass = useMemo(() => new THREE.Shape([new THREE.Vector2(-W + 0.8, 0.2), new THREE.Vector2(0, S * 2.2 - S * 0.9), new THREE.Vector2(W - 0.8, 0.2)]), [W, S]);
  const pediment = useMemo(() => gable(16, 5.7, 4), []);
  const floorsAbove = h.floors > 1 && h.style !== "aframe" && (
    <>
      <Block x0={-W} x1={W} y0={S} y1={S + up} z0={-D} z1={0} m={wall} cast />
      <Block x0={-W - 0.15} x1={W + 0.15} y0={S - 0.1} y1={S + 0.2} z0={-D - 0.15} z1={0.15} m={trim} />
    </>
  );
  // Windows: across the front and back of every floor.
  const n = Math.max(2, Math.round(W / 3));
  const windows: React.ReactNode[] = [];
  const glassy = h.style === "glass" || h.style === "contemporary" || h.style === "modern";
  for (let f = 0; f < h.floors; f++) {
    if (h.style === "aframe" && f > 0) break;
    for (let i = 0; i < n; i++) {
      const x = -W + ((i + 0.5) * 2 * W) / n;
      if (f === 0 && Math.abs(x) < P.doorHalf + 0.8) continue;
      const ww = glassy ? (2 * W) / n - 0.4 : 1.4;
      const wh = glassy ? S - 1 : 1.8;
      windows.push(<Window key={`f${f}-${i}`} x={x} y={f * S + (glassy ? S / 2 : S * 0.55)} z={0.04} w={ww} h={wh} trim={h.trim} />);
      windows.push(<Window key={`b${f}-${i}`} x={x} y={f * S + (glassy ? S / 2 : S * 0.55)} z={-D - 0.04} w={ww} h={wh} side={Math.PI} trim={h.trim} />);
    }
    for (const s of [-1, 1]) {
      const m = Math.max(1, Math.round(D / 5));
      for (let i = 0; i < m; i++) windows.push(<Window key={`s${s}${f}-${i}`} x={s * (W + 0.04)} y={f * S + S * 0.55} z={-D + ((i + 0.5) * D) / m} w={glassy ? D / m - 0.6 : 1.3} h={glassy ? S - 1.2 : 1.7} side={(s * Math.PI) / 2} trim={h.trim} />);
    }
  }

  let roof: React.ReactNode;
  switch (h.style) {
    case "cottage":
    case "craftsman":
    case "colonial":
      roof = <Roof kind="gable" W={W} D={D} y={top} rise={h.style === "cottage" ? W * 0.9 : W * 0.6} color={h.roof} />;
      break;
    case "bungalow":
    case "villa":
    case "tuscan":
      roof = <Hip W={W} D={D} y={top} rise={Math.min(W, D) * 0.45} color={h.roof} />;
      break;
    case "aframe":
      roof = (
        <group>
          <mesh geometry={aFrame} material={mat(h.roof, 0.85)} position={[0, 0, 0.75]} castShadow raycast={noRaycast} />
          {/* The glass gable at the front */}
          <mesh position={[0, S * 0.9, 0.82]} raycast={noRaycast}>
            <shapeGeometry args={[aGlass]} />
            <meshStandardMaterial color="#7fa9c4" roughness={0.08} metalness={0.7} side={THREE.DoubleSide} />
          </mesh>
          <Block x0={-W - 1} x1={W + 1} y0={0} y1={0.5} z0={0.2} z1={4} m={mat("#a87a45", 0.8)} />
        </group>
      );
      break;
    case "chateau":
      roof = (
        <group>
          <Hip W={W} D={D} y={top} rise={S * 1.6} color={h.roof} flatTop />
          {[-1, 1].flatMap((sx) =>
            [0, -D].map((z) => (
              <group key={`${sx}${z}`} position={[sx * W, 0, z]}>
                <Cyl x={0} y={(top + 2) / 2} z={0} r={2.6} h={top + 2} m={wall} />
                <mesh position-y={top + 2 + 2.6} castShadow raycast={noRaycast}>
                  <coneGeometry args={[3, 5.2, 16]} />
                  <meshStandardMaterial color={h.roof} roughness={0.7} />
                </mesh>
              </group>
            )),
          )}
        </group>
      );
      break;
    case "crown":
      roof = (
        <group>
          <Roof kind="flat" W={W} D={D} y={top} rise={0} color={h.trim} />
          <mesh position={[0, top + 0.4, -D / 2]} castShadow raycast={noRaycast}>
            <sphereGeometry args={[9, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={h.roof} roughness={0.3} metalness={0.4} />
          </mesh>
          <Cyl x={0} y={top + 10.5} z={-D / 2} r={0.4} h={2.5} m={mat(h.trim, 0.3, 0.8)} />
          {/* The grand portico: columns and a pediment */}
          {Array.from({ length: 8 }, (_, i) => (
            <Cyl key={i} x={-14 + i * 4} y={top / 2} z={4} r={0.7} h={top} m={mat("#ffffff", 0.35)} />
          ))}
          <Block x0={-16} x1={16} y0={top} y1={top + 1.4} z0={-0.2} z1={5.5} m={mat("#ffffff", 0.35)} />
          <mesh geometry={pediment} material={mat("#ffffff", 0.35)} position={[0, top + 1.4, 5.5]} raycast={noRaycast} />
          <Block x0={-16} x1={16} y0={0} y1={0.6} z0={0} z1={8} m={mat("#e9e4da", 0.3)} />
        </group>
      );
      break;
    case "contemporary":
      roof = (
        <group>
          <Roof kind="flat" W={W} D={D} y={top} rise={0} color={h.roof} />
          {/* A cantilevered top floor sticking out over the front, with a glass railing */}
          <Block x0={-W * 0.2} x1={W + 6} y0={S * 2} y1={S * 3} z0={-D * 0.7} z1={4} m={mat(h.trim, 0.6)} cast />
          <Block x0={-W * 0.2} x1={W + 6} y0={S * 2 + 0.6} y1={S * 3 - 0.6} z0={3.95} z1={4.05} m={mat("#7fa9c4", 0.08, 0.7)} />
        </group>
      );
      break;
    default:
      roof = <Roof kind="flat" W={W} D={D} y={top} rise={0} color={h.roof} />;
  }

  return (
    <group>
      {floorsAbove}
      {windows}
      {roof}
      {h.style === "tuscan" && (
        <group position={[W - 4, 0, -D + 4]}>
          <Block x0={-3} x1={3} y0={0} y1={top + 7} z0={-3} z1={3} m={wall} cast />
          <Hip W={3} D={6} y={top + 7} rise={3} color={h.roof} />
          <Window x={0} y={top + 4} z={3.05} w={1.4} h={2.2} trim={h.trim} />
        </group>
      )}
      {h.style === "colonial" && (
        <group>
          {[-1, 1].map((s) => [3, 6].map((x) => <Cyl key={`${s}${x}`} x={s * x * (W / 10)} y={S} z={2.4} r={0.32} h={S * 2} m={mat("#ffffff", 0.4)} />))}
          <Block x0={-W * 0.7} x1={W * 0.7} y0={S * 2} y1={S * 2 + 0.4} z0={0} z1={3} m={mat("#ffffff", 0.4)} />
        </group>
      )}
      {(h.style === "cottage" || h.style === "colonial") && (
        <Block x0={W * 0.5} x1={W * 0.5 + 1.4} y0={top} y1={top + W * 0.7} z0={-D * 0.4} z1={-D * 0.4 + 1.4} m={mat("#8b4a3a", 0.9)} />
      )}
      {h.style === "cottage" &&
        [-1, 1].map((s) => (
          <group key={s}>
            <Block x0={s * (W * 0.55) - 1.25} x1={s * (W * 0.55) - 0.85} y0={1.1} y1={3} z0={0} z1={0.12} m={mat(h.trim, 0.5)} />
            <Block x0={s * (W * 0.55) + 0.85} x1={s * (W * 0.55) + 1.25} y0={1.1} y1={3} z0={0} z1={0.12} m={mat(h.trim, 0.5)} />
          </group>
        ))}
    </group>
  );
}

/** Pools, garages, tennis courts, helipads… round the house. */
function Grounds({ h }: { h: Home }) {
  const P = homePlan(h);
  const W = P.W;
  const D = P.D;
  const big = h.w / 26;
  const water = mat("#3fb6e8", 0.05, 0.1, "#0b4f6c");
  const deck = mat("#e9e4da", 0.6);
  const out: React.ReactNode[] = [];
  // The path to the door and the driveway.
  out.push(<Block key="path" x0={-1.2} x1={1.2} y0={0} y1={0.06} z0={0} z1={12} m={mat("#c9c2b5", 0.9)} />);
  if (h.extras.includes("pool")) {
    const pw = Math.min(W * 0.9, 6 + big * 6);
    const pd = 4 + big * 3;
    out.push(
      <group key="pool" position={[0, 0, -D - 4 - pd / 2]}>
        <Block x0={-pw - 1.2} x1={pw + 1.2} y0={0} y1={0.1} z0={-pd / 2 - 1.2} z1={pd / 2 + 1.2} m={deck} />
        <mesh position-y={0.12} rotation-x={-Math.PI / 2} raycast={noRaycast}>
          <planeGeometry args={[pw * 2, pd]} />
          <primitive object={water} attach="material" />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * (pw * 0.5), 0.1, pd / 2 + 2.2]}>
            <Block x0={-0.5} x1={0.5} y0={0} y1={0.4} z0={-1} z1={1} m={mat("#ffffff", 0.5)} />
            <Block x0={-0.5} x1={0.5} y0={0.4} y1={1} z0={0.8} z1={1} m={mat("#ffffff", 0.5)} />
          </group>
        ))}
      </group>,
    );
  }
  if (h.extras.includes("hottub")) out.push(<Cyl key="tub" x={W * 0.4} y={0.7} z={2.6} r={1.4} h={0.9} m={mat("#8b5a3c", 0.7)} />, <Cyl key="tubw" x={W * 0.4} y={1.17} z={2.6} r={1.2} h={0.05} m={water} />);
  if (h.extras.includes("garage"))
    out.push(
      <group key="garage" position={[W + 4.5 * Math.max(1, big * 0.8), 0, -D * 0.35]}>
        <Block x0={-4.5 * Math.max(1, big * 0.8)} x1={4.5 * Math.max(1, big * 0.8)} y0={0} y1={3.8} z0={-D * 0.6} z1={0} m={mat(h.wall, 0.85)} cast />
        <Block x0={-3.8 * Math.max(1, big * 0.8)} x1={3.8 * Math.max(1, big * 0.8)} y0={0} y1={3} z0={0} z1={0.06} m={mat("#e9ecef", 0.5, 0.3)} />
        <Block x0={-4.6 * Math.max(1, big * 0.8)} x1={4.6 * Math.max(1, big * 0.8)} y0={3.8} y1={4.2} z0={-D * 0.6 - 0.1} z1={0.1} m={mat(h.roof, 0.8)} />
        <Block x0={-4} x1={4} y0={0} y1={0.05} z0={0} z1={12} m={mat("#9aa3ad", 0.9)} />
      </group>,
    );
  if (h.extras.includes("tennis"))
    out.push(
      <group key="tennis" position={[-W - 22, 0, -D / 2]}>
        <Block x0={-9} x1={9} y0={0} y1={0.06} z0={-18} z1={18} m={mat("#2f7d5a", 0.8)} />
        <Block x0={-5.5} x1={5.5} y0={0.06} y1={0.08} z0={-12} z1={12} m={mat("#3d8fd0", 0.8)} />
        {[-12, 12, 0].map((z) => (
          <Block key={z} x0={-5.5} x1={5.5} y0={0.08} y1={0.09} z0={z - 0.08} z1={z + 0.08} m={mat("#ffffff", 0.8)} />
        ))}
        <Block x0={-6} x1={6} y0={0} y1={1.1} z0={-0.04} z1={0.04} m={mat("#1b1d21", 0.9)} />
      </group>,
    );
  if (h.extras.includes("helipad"))
    out.push(
      <group key="heli" position={[W + 16, 0, -D - 6]}>
        <Cyl x={0} y={0.08} z={0} r={9} h={0.16} m={mat("#2b2f36", 0.7)} />
        <Block x0={-3} x1={-2} y0={0.17} y1={0.19} z0={-4} z1={4} m={mat("#ffffff", 0.6)} />
        <Block x0={2} x1={3} y0={0.17} y1={0.19} z0={-4} z1={4} m={mat("#ffffff", 0.6)} />
        <Block x0={-2} x1={2} y0={0.17} y1={0.19} z0={-0.5} z1={0.5} m={mat("#ffffff", 0.6)} />
      </group>,
    );
  if (h.extras.includes("fountain"))
    out.push(
      <group key="fountain" position={[W * 0.6 + 4, 0, 10]}>
        <Cyl x={0} y={0.4} z={0} r={3.2} h={0.8} m={mat("#e9e4da", 0.5)} />
        <Cyl x={0} y={0.82} z={0} r={2.9} h={0.05} m={water} />
        <Cyl x={0} y={1.6} z={0} r={0.35} h={2} m={mat("#e9e4da", 0.5)} />
        <Cyl x={0} y={2.6} z={0} r={1.2} h={0.25} m={mat("#e9e4da", 0.5)} />
      </group>,
    );
  if (h.extras.includes("porch") && h.style !== "colonial")
    out.push(
      <group key="porch">
        <Block x0={-W + 0.5} x1={W - 0.5} y0={0} y1={0.4} z0={0} z1={3} m={mat("#a87a45", 0.8)} />
        <Block x0={-W + 0.3} x1={W - 0.3} y0={h.storey - 0.3} y1={h.storey} z0={-0.2} z1={3.2} m={mat(h.roof, 0.8)} />
        {[-1, 1].map((s) => (
          <Block key={s} x0={s * (W - 1) - 0.25} x1={s * (W - 1) + 0.25} y0={0.4} y1={h.storey - 0.3} z0={2.5} z1={3} m={mat(h.style === "craftsman" ? "#8a8f96" : "#ffffff", 0.6)} />
        ))}
      </group>,
    );
  // Hedges and trees round the bigger lots.
  if (h.area === "estates")
    for (const s of [-1, 1])
      out.push(
        <mesh key={`tree${s}`} position={[s * (W + 6), 3.4, 6]} castShadow raycast={noRaycast}>
          <icosahedronGeometry args={[2.6, 1]} />
          <meshStandardMaterial color="#3f7d3a" roughness={0.9} flatShading />
        </mesh>,
        <Cyl key={`trunk${s}`} x={s * (W + 6)} y={1} z={6} r={0.3} h={2} m={mat("#5b3a26", 0.9)} />,
      );
  return <>{out}</>;
}

function ForSale({ h }: { h: Home }) {
  const mine = ownsHome(h.id);
  const sign = useMemo(() => signTexture(mine ? "Home" : `For sale ${usd(h.price)}`, { bg: mine ? "#2f8f3a" : "#c8102e", fg: "#ffffff", height: 96 }), [mine, h.price]);
  return (
    <group position={[h.w / 2 - 2, 0, 9]}>
      <Block x0={-0.06} x1={0.06} y0={0} y1={2.4} z0={-0.06} z1={0.06} m={mat("#ffffff", 0.6)} />
      <mesh position={[0, 2.1, 0.08]} raycast={noRaycast}>
        <planeGeometry args={[Math.min(3.4, 0.9 * sign.aspect), 0.9]} />
        <meshStandardMaterial map={sign.texture} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function HomeModel({ h }: { h: Home }) {
  const P = homePlan(h);
  const wall = mat(h.wall, 0.85);
  const inside = mat("#f6f1e7", 0.9);
  const trim = mat(h.trim, 0.5);
  const inner = useRef<THREE.Group>(null);
  useFrame(() => {
    // Only draw the furniture when you're close (or on the tour).
    if (inner.current) show(inner.current, access.touring === h.id || Math.hypot(player.x - h.site.x, player.z - h.site.z) < 70);
  });
  const S = h.storey;
  return (
    <group position={[h.site.x, 0, h.site.z]} rotation-y={h.site.turn}>
      {/* Everything that never moves, merged into a few meshes (a house is hundreds of boxes) */}
      <Static>
      {/* The ground floor's walls (outside face, inside face) */}
      {P.walls.slice(0, 5).map((b, i) => (
        <Block key={i} x0={b.lx0} x1={b.lx1} y0={0} y1={S} z0={b.lz0} z1={b.lz1} m={h.style === "aframe" ? inside : wall} cast />
      ))}
      {P.walls.slice(5).map((b, i) => (
        <Block key={`in${i}`} x0={b.lx0} x1={b.lx1} y0={0} y1={S - 0.05} z0={b.lz0} z1={b.lz1} m={inside} />
      ))}
      {[
        [-P.W + P.t, -P.W + P.t + 0.02, -P.D + P.t, -P.t],
        [P.W - P.t - 0.02, P.W - P.t, -P.D + P.t, -P.t],
      ].map(([x0, x1, z0, z1], i) => (
        <Block key={`skin${i}`} x0={x0} x1={x1} y0={0.05} y1={S - 0.05} z0={z0} z1={z1} m={inside} />
      ))}
      <Block x0={-P.W + P.t} x1={P.W - P.t} y0={0.05} y1={S - 0.05} z0={-P.D + P.t} z1={-P.D + P.t + 0.02} m={inside} />
      {/* Above the front door, and the ground floor's ceiling */}
      <Block x0={-P.doorHalf} x1={P.doorHalf} y0={2.95} y1={S} z0={-P.t} z1={0} m={h.style === "aframe" ? inside : wall} />
      <Block x0={-P.doorHalf - 0.15} x1={P.doorHalf + 0.15} y0={2.9} y1={3.05} z0={-P.t - 0.05} z1={0.1} m={trim} />
      <Block x0={-P.W} x1={P.W} y0={S - 0.05} y1={S} z0={-P.D} z1={0} m={inside} />
        <Upper h={h} />
        <Grounds h={h} />
      </Static>
      <FrontDoor h={h} />
      <ForSale h={h} />
      <group ref={inner}>
        <Static shadows={false}>
          <Interior h={h} />
        </Static>
      </group>
    </group>
  );
}

// ---- Crescent Heights' wall and gate -------------------------------------------------------------

function Gate() {
  const W = ESTATE_WALL;
  const arms = useRef<(THREE.Group | null)[]>([]);
  const lift = useRef(0);
  const guard = useMemo(() => randomLook(901, { outfit: "suit", shirt: "#1b1d21", pants: "#1b1d21", accent: "#d4a017" }), []);
  const pose = useMemo(newPose, []);
  useFrame((_, dt) => {
    lift.current = THREE.MathUtils.damp(lift.current, access.now < access.gateOpenUntil ? 1 : 0, 4, dt);
    arms.current.forEach((a, i) => a && (a.rotation.z = (i ? -1 : 1) * lift.current * 1.35));
    pose.reach = lift.current > 0.1 && lift.current < 0.9 ? 0.8 : 0.1;
  });
  const sign = useMemo(() => signTexture("Crescent Heights", { bg: "#1f3a5f", fg: "#d4a017", height: 128 }), []);
  const stone = mat("#cfc6b6", 0.95);
  const z = W.z0;
  return (
    <group>
      {/* The gatehouse in the middle of the road */}
      <group position={[0, 0, z]}>
        <Block x0={-2.2} x1={2.2} y0={0} y1={3.4} z0={-3} z1={3} m={stone} cast />
        <Block x0={-2.6} x1={2.6} y0={3.4} y1={3.8} z0={-3.4} z1={3.4} m={mat("#1f3a5f", 0.6)} />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={BOX} material={mat("#7fa9c4", 0.08, 0.7)} position={[s * 2.22, 2, 0]} scale={[0.05, 1.4, 4.4]} raycast={noRaycast} />
        ))}
        <group position={[-2.6, 0, -1.4]} rotation-y={-Math.PI / 2}>
          <Humanoid look={guard} pose={pose} />
        </group>
      </group>
      {/* The barrier arms */}
      {[-1, 1].map((s, i) => (
        <group key={s} position={[s * 2.4, 1.1, z - 0.2]}>
          <Block x0={-0.3} x1={0.3} y0={-1.1} y1={0.2} z0={-0.3} z1={0.3} m={mat("#ffd21f", 0.6)} />
          <group ref={(g) => void (arms.current[i] = g)}>
            {Array.from({ length: 5 }, (_, k) => (
              <mesh key={k} geometry={BOX} material={mat(k % 2 ? "#ffffff" : "#e5402b", 0.6)} position={[s * (0.9 + k * 1.8), 0, 0]} scale={[1.8, 0.22, 0.16]} raycast={noRaycast} />
            ))}
          </group>
        </group>
      ))}
      {/* Stone pillars with the sign */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (W.gapHalf + 2.5), 0, z]}>
          <Block x0={-1.6} x1={1.6} y0={0} y1={5.4} z0={-1.6} z1={1.6} m={stone} cast />
          <mesh position={[0, 5.9, 0]} raycast={noRaycast}>
            <sphereGeometry args={[0.9, 16, 10]} />
            <meshStandardMaterial color="#d4a017" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[0, 3.6, -1.62]} rotation-y={Math.PI} raycast={noRaycast}>
            <planeGeometry args={[3, 3 / sign.aspect]} />
            <meshStandardMaterial map={sign.texture} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function EstateWall() {
  const W = ESTATE_WALL;
  const stone = useDrawn(256, 128, (g) => {
    g.fillStyle = "#b9ae9c";
    g.fillRect(0, 0, 256, 128);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 6; c++) {
        g.fillStyle = ["#cfc6b6", "#c2b8a6", "#d8d0c2", "#bdb19e"][(r + c * 3) % 4];
        g.fillRect(c * 44 + (r % 2) * 22 + 2, r * 32 + 2, 40, 28);
      }
  });
  const m = useMemo(() => {
    const t = stone.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(20, 1);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  }, [stone]);
  const segs: [number, number, number, number][] = [
    [W.x0, -W.gapHalf - 1, W.z0, W.z0],
    [W.gapHalf + 1, W.x1, W.z0, W.z0],
    [W.x0, W.x0, W.z0, W.z1],
    [W.x1, W.x1, W.z0, W.z1],
    [W.x0, W.x1, W.z1, W.z1],
  ];
  return (
    <group>
      {segs.map(([x0, x1, z0, z1], i) => (
        <mesh key={i} material={m} position={[(x0 + x1) / 2, W.h / 2, (z0 + z1) / 2]} scale={[Math.max(W.t, x1 - x0), W.h, Math.max(W.t, z1 - z0)]} castShadow receiveShadow raycast={noRaycast}>
          <boxGeometry />
        </mesh>
      ))}
    </group>
  );
}

export function Homes() {
  return (
    <>
      {HOMES.map((h) => (
        <Near key={h.id} x={h.site.x} z={h.site.z} dist={480}>
          <HomeModel h={h} />
        </Near>
      ))}
      <EstateWall />
      <Gate />
    </>
  );
}
