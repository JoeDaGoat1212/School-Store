"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { player } from "./bump";
import { JEWELRY, JEWELRY_PLAN, toWorld, type Site } from "./city-layout";
import { drive } from "./drive";
import { SITE_CENTER, closedFor, game, isClosed, isTaken, jewelryLasers, jewelryLasersOn } from "./heist";
import type { SiteKey } from "./city-layout";
import { canvasTexture, noRaycast, seededRandom } from "./paint";
import { Humanoid, newPose, type Look } from "./humanoid";
import { letterGeometry } from "./text3d";

/*
 * The two buildings in the city you can walk into (and rob):
 *
 *   The bank: a grand cartoon bank with columns, steps and a gold dome.
 *   Inside, a marble hall with three tellers behind the counter and, at the
 *   back, the vault behind a huge round steel door. Rob it and the alarm
 *   lights spin, the tellers put their hands up, a drill bites into the door,
 *   the wheel spins, the bolts pull back and the door swings open on a vault
 *   full of gold bars and cash.
 *
 *   The jewelry shop: a pink boutique with a striped awning and a giant
 *   spinning diamond on the roof. Inside, glass cases of rings, necklaces and
 *   watches (smash them!), and the Big Rock on a stand behind sweeping lasers.
 *
 * Everything is drawn in each building's own frame (lx left–right, lz out of
 * the front), placed and turned by a group; the numbers are in
 * city-layout.ts. What happens (alarms, what's been taken) is in heist.ts.
 */

export const Toon = ({ color, emissive }: { color: string; emissive?: string }) => <meshStandardMaterial color={color} emissive={emissive ?? "#000000"} roughness={0.78} />;

/** A box from (x0, y0, z0) to (x1, y1, z1), in the building's own frame. */
export function Slab({ x0, x1, y0, y1, z0, z1, color, cast = false, children }: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; color?: string; cast?: boolean; children?: React.ReactNode }) {
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} castShadow={cast} raycast={noRaycast}>
      <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
      {children ?? <Toon color={color ?? "#ffffff"} />}
    </mesh>
  );
}

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const backOut = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** The floors inside, just above the city's paving (you walk at the same height everywhere, so they stay low). */
const SHOP_FLOOR = 0.32;

// ---- Pictures drawn once ---------------------------------------------------------------------

export function useCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!);
    return canvasTexture(c, repeat);
    // (Drawn once: the drawing never changes.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export function checker(g: CanvasRenderingContext2D, a: string, b: string, line: string) {
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * 128, y * 128, 128, 128);
    }
  // A few soft veins, for marble.
  const rand = seededRandom(9);
  g.strokeStyle = line;
  g.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    g.beginPath();
    let x = rand() * 256;
    let y = rand() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) g.lineTo((x += (rand() - 0.5) * 60), (y += rand() * 40));
    g.stroke();
  }
}

// ---- People behind the counters ------------------------------------------------------------------

/** A person (a teller, the shopkeeper). Puts their hands up and trembles while `scared()` says so. */
export function Person({ position, turn = 0, shirt, skin, hair = "#2a1a12", tie, scared }: { position: [number, number, number]; turn?: number; shirt: string; skin: string; hair?: string; tie?: string; scared: () => boolean }) {
  const look = useMemo<Look>(() => ({ skin, hair, hairStyle: tie ? "short" : "bun", shirt, pants: "#2b2f36", shoes: "#1b1d21", outfit: tie ? "suit" : "casual", accent: tie }), [skin, hair, shirt, tie]);
  const pose = useMemo(newPose, []);
  const body = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    pose.handsUp = THREE.MathUtils.damp(pose.handsUp, scared() ? 1 : 0, 6, delta);
    if (body.current) body.current.rotation.y = pose.handsUp > 0.5 ? Math.sin(t * 3) * 0.12 : 0;
    if (body.current) body.current.position.x = pose.handsUp > 0.5 ? Math.sin(t * 40) * 0.02 : 0;
  });
  return (
    <group position={position} rotation-y={turn}>
      <group ref={body}>
        <Humanoid look={look} pose={pose} />
      </group>
    </group>
  );
}

// ---- Sliding glass doors that open as you walk up --------------------------------------------

export function SlidingDoors({ site, half, height }: { site: Site; half: number; height: number }) {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const at = useMemo(() => toWorld(site, 0, 0), [site]);
  const open = useRef(0);
  useFrame((_, delta) => {
    const x = drive.active ? drive.pos.x : player.x;
    const z = drive.active ? drive.pos.z : player.z;
    const near = Math.hypot(x - at.x, z - at.z) < 7;
    open.current = THREE.MathUtils.damp(open.current, near ? 1 : 0, 6, delta);
    const slide = open.current * half * 0.95;
    if (left.current) left.current.position.x = -half / 2 - slide;
    if (right.current) right.current.position.x = half / 2 + slide;
  });
  const panel = (
    <>
      <mesh position-y={height / 2} raycast={noRaycast}>
        <boxGeometry args={[half - 0.1, height - 0.2, 0.12]} />
        <meshStandardMaterial color="#bfe6ff" transparent opacity={0.35} roughness={0.05} metalness={0.2} depthWrite={false} />
      </mesh>
      <mesh position-y={height / 2} raycast={noRaycast}>
        <boxGeometry args={[half, height, 0.08]} />
        <meshBasicMaterial color="#c9a227" wireframe />
      </mesh>
    </>
  );
  return (
    <group position-z={-0.5}>
      <group ref={left}>{panel}</group>
      <group ref={right}>{panel}</group>
    </group>
  );
}

// ---- Spinning alarm lights --------------------------------------------------------------------

/** A red alarm light on a wall: dark until the alarm, then it spins and flashes. */
export function AlarmLight({ position, turn = 0, on }: { position: [number, number, number]; turn?: number; on: () => boolean }) {
  const beams = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state, delta) => {
    const active = on();
    if (beams.current) {
      beams.current.visible = active;
      beams.current.rotation.y += delta * 7;
    }
    lamp.current?.color.set(active ? (state.clock.elapsedTime * 4 % 1 < 0.5 ? "#ff2a1a" : "#ff8a6a") : "#6a1a14");
  });
  return (
    <group position={position} rotation-y={turn}>
      <mesh position-y={-0.3} raycast={noRaycast}>
        <cylinderGeometry args={[0.5, 0.6, 0.3, 12]} />
        <Toon color="#3b4046" />
      </mesh>
      <mesh raycast={noRaycast}>
        <sphereGeometry args={[0.45, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial ref={lamp} color="#6a1a14" toneMapped={false} />
      </mesh>
      <group ref={beams} visible={false}>
        {[0, Math.PI].map((a) => (
          <mesh key={a} rotation={[0, a, Math.PI / 2]} position={[Math.cos(a) * 3, 0.15, -Math.sin(a) * 3]} raycast={noRaycast}>
            <coneGeometry args={[1.4, 6, 16, 1, true]} />
            <meshBasicMaterial color="#ff3b2a" transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Fades a piece of loot away (shrinking and spinning) once it's been taken. */
export function useTakenAnim(id: string) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const at = game.taken.get(id);
    if (at === undefined) {
      g.visible = true;
      g.scale.setScalar(1);
      g.rotation.y = 0;
      return;
    }
    const k = clamp01((game.now - at) / 0.4);
    g.visible = k < 1;
    g.scale.setScalar(1 - ease(k));
    g.rotation.y = k * 6;
    g.position.y = k * 2;
  });
  return ref;
}

// ======================================================================================
// The jewelry shop
// ======================================================================================

export function Jewelry() {
  const P = JEWELRY_PLAN;
  const W = P.halfW;
  const D = P.depth;
  const H = P.height;
  const t = P.wall;
  const stripes = useCanvas(128, 16, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? "#ffffff" : "#e5487f";
      g.fillRect(i * 16, 0, 16, 16);
    }
  }, [4, 1]);
  const carpet = useCanvas(128, 128, (g) => {
    g.fillStyle = "#6c3fa0";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#7d4fb4";
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) g.fillRect(x * 16 + 6, y * 16 + 6, 4, 4);
  }, [8, 6]);
  const letters = useMemo(() => letterGeometry("JEWELS", 1.8, 0.35), []);
  const pink = "#ff9ec4";
  const trim = "#fff7fb";
  const alarmOn = () => game.sites.jewelry.alarm;
  const win = (x0: number, x1: number) => (
    <mesh position={[(x0 + x1) / 2, 3.6, -t / 2]} raycast={noRaycast}>
      <boxGeometry args={[x1 - x0, 4.6, t + 0.1]} />
      <meshStandardMaterial color="#cdeeff" transparent opacity={0.35} roughness={0.05} depthWrite={false} />
    </mesh>
  );

  return (
    <group position={[JEWELRY.x, 0, JEWELRY.z]} rotation-y={JEWELRY.turn}>
      {/* ---- The building: pink walls with big display windows, a striped awning, gold letters ---- */}
      <Slab x0={-W - 0.6} x1={W + 0.6} y0={0} y1={SHOP_FLOOR - 0.02} z0={-D - 0.6} z1={0.5} color="#e7e1d6" />
      {/* Front wall in pieces round the windows and door */}
      <Slab x0={-W} x1={-P.doorHalf} y0={0} y1={1.3} z0={-t} z1={0} color={pink} cast />
      <Slab x0={P.doorHalf} x1={W} y0={0} y1={1.3} z0={-t} z1={0} color={pink} cast />
      <Slab x0={-W} x1={W} y0={5.9} y1={H} z0={-t} z1={0} color={pink} cast />
      <Slab x0={-W} x1={-W + 1.4} y0={0} y1={H} z0={-t} z1={0} color={pink} cast />
      <Slab x0={W - 1.4} x1={W} y0={0} y1={H} z0={-t} z1={0} color={pink} cast />
      <Slab x0={-P.doorHalf - 1} x1={-P.doorHalf} y0={0} y1={H} z0={-t} z1={0} color={pink} cast />
      <Slab x0={P.doorHalf} x1={P.doorHalf + 1} y0={0} y1={H} z0={-t} z1={0} color={pink} cast />
      {win(-W + 1.4, -P.doorHalf - 1)}
      {win(P.doorHalf + 1, W - 1.4)}
      <Slab x0={-W} x1={-W + t} y0={0} y1={H} z0={-D} z1={0} color={pink} cast />
      <Slab x0={W - t} x1={W} y0={0} y1={H} z0={-D} z1={0} color={pink} cast />
      <Slab x0={-W} x1={W} y0={0} y1={H} z0={-D} z1={-D + t} color={pink} cast />
      <Slab x0={-W - 0.5} x1={W + 0.5} y0={H} y1={H + 0.7} z0={-D - 0.5} z1={0.5} color={trim} cast />
      {/* Awning */}
      <mesh position={[0, 6.6, 1.6]} rotation-x={0.35} castShadow raycast={noRaycast}>
        <boxGeometry args={[W * 2 + 0.6, 0.25, 3.6]} />
        <meshStandardMaterial map={stripes} roughness={0.78} />
      </mesh>
      <mesh geometry={letters} position={[0, 7.4, 0.3]} raycast={noRaycast}>
        <Toon color="#ffcc33" emissive="#4a3200" />
      </mesh>
      <SlidingDoors site={JEWELRY} half={P.doorHalf} height={P.doorHeight} />
      <RoofDiamond y={H + 0.7} />
      <AlarmLight position={[-W + 1, H + 1.2, -1]} on={alarmOn} />
      <AlarmLight position={[W - 1, H + 1.2, -1]} on={alarmOn} />

      {/* ---- Inside: purple carpet, a mirror wall, sparkly chandeliers ---- */}
      <mesh rotation-x={-Math.PI / 2} position={[0, SHOP_FLOOR, -D / 2]} raycast={noRaycast}>
        <planeGeometry args={[W * 2 - t * 2, D - t * 2]} />
        <meshStandardMaterial map={carpet} roughness={0.78} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, H - 0.05, -D / 2]} raycast={noRaycast}>
        <planeGeometry args={[W * 2, D]} />
        <Toon color="#fff0f6" />
      </mesh>
      <mesh position={[0, 5, -D + t + 0.05]} raycast={noRaycast}>
        <planeGeometry args={[W * 2 - t * 2 - 2, 6]} />
        <meshStandardMaterial color="#dfefff" roughness={0.05} metalness={0.8} />
      </mesh>
      {[-6, 6].map((x) => (
        <Chandelier key={x} position={[x, H - 0.1, -12]} />
      ))}
      <Slab x0={P.counter.lx0} x1={P.counter.lx1} y0={0} y1={SHOP_FLOOR + P.counter.height} z0={P.counter.lz0} z1={P.counter.lz1} color="#ffffff" />
      <Slab x0={P.counter.lx0 - 0.1} x1={P.counter.lx1 + 0.1} y0={SHOP_FLOOR + P.counter.height} y1={SHOP_FLOOR + 0.2 + P.counter.height} z0={P.counter.lz0 - 0.1} z1={P.counter.lz1 + 0.1} color="#ffcc33" />
      <Person position={[0, SHOP_FLOOR, P.keeperZ]} shirt="#1b1d21" skin="#c98e62" hair="#2a1a12" tie="#ff9ec4" scared={alarmOn} />
      <AlarmLight position={[0, H - 0.8, -D + t + 0.8]} on={alarmOn} />

      {P.cases.map((c, i) => (
        <DisplayCase key={i} id={`case-${i}`} lx={c.lx} lz={c.lz} seed={i} />
      ))}
      <BigRock />
      <Sparkles />
    </group>
  );
}

/** A giant diamond on the roof, spinning and bobbing. */
function RoofDiamond({ y }: { y: number }) {
  const gem = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!gem.current) return;
    gem.current.rotation.y += delta * 0.8;
    gem.current.position.y = y + 7 + Math.sin(state.clock.elapsedTime * 1.5) * 0.5;
  });
  return (
    <group>
      <mesh position={[0, y + 2.5, -6]} raycast={noRaycast}>
        <cylinderGeometry args={[0.25, 0.25, 5, 8]} />
        <Toon color="#c9d1d9" />
      </mesh>
      <group ref={gem} position={[0, y + 7, -6]}>
        <Diamond size={2.6} color="#7fe7ff" />
      </group>
    </group>
  );
}

/** A cartoon cut diamond: a flat top (crown) over a pointed bottom (pavilion). */
function Diamond({ size, color }: { size: number; color: string }) {
  return (
    <group scale={size}>
      <mesh position-y={0.2} raycast={noRaycast}>
        <cylinderGeometry args={[0.55, 1, 0.4, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.15} metalness={0.1} flatShading />
      </mesh>
      <mesh position-y={-0.6} rotation-x={Math.PI} raycast={noRaycast}>
        <coneGeometry args={[1, 1.2, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} roughness={0.15} metalness={0.1} flatShading />
      </mesh>
    </group>
  );
}

function Chandelier({ position }: { position: [number, number, number] }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (g.current) g.current.rotation.y += delta * 0.3;
  });
  return (
    <group position={position}>
      <mesh position-y={-0.8} raycast={noRaycast}>
        <cylinderGeometry args={[0.04, 0.04, 1.6, 6]} />
        <meshBasicMaterial color="#c9a227" />
      </mesh>
      <group ref={g} position-y={-1.8}>
        <mesh raycast={noRaycast}>
          <torusGeometry args={[1.1, 0.07, 8, 24]} />
          <Toon color="#ffcc33" />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 1.1, -0.35, Math.sin(a) * 1.1]} raycast={noRaycast}>
              <octahedronGeometry args={[0.22]} />
              <meshBasicMaterial color="#e8fbff" toneMapped={false} />
            </mesh>
          );
        })}
        <mesh position-y={-0.2} raycast={noRaycast}>
          <sphereGeometry args={[0.35, 12, 10]} />
          <meshBasicMaterial color="#fff6d6" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** A glass case full of jewelry. Once it's smashed, the glass and everything in it is gone (heist.ts sends the shards flying). */
function DisplayCase({ id, lx, lz, seed }: { id: string; lx: number; lz: number; seed: number }) {
  const S = JEWELRY_PLAN.caseSize;
  const glass = useRef<THREE.Group>(null);
  const items = useRef<THREE.Group>(null);
  // What's in it: a few rings, necklaces, watches or loose gems.
  const things = useMemo(() => {
    const rand = seededRandom(31 + seed * 7);
    const gems = ["#ff4d6d", "#4dd2ff", "#7cff8a", "#c77dff", "#ffd60a", "#ffffff"];
    return Array.from({ length: 4 }, (_, k) => ({
      z: (k - 1.5) * 0.78,
      kind: Math.floor(rand() * 4),
      gem: gems[Math.floor(rand() * gems.length)],
      spin: 0.6 + rand(),
    }));
  }, [seed]);
  useFrame((state) => {
    const taken = isTaken(id);
    if (glass.current) glass.current.visible = !taken;
    if (items.current) {
      items.current.visible = !taken;
      items.current.children.forEach((c, k) => (c.rotation.y = state.clock.elapsedTime * things[k].spin));
    }
  });
  const top = S.base + 0.5;
  return (
    <group position={[lx, SHOP_FLOOR, lz]}>
      <mesh position-y={S.base / 2} raycast={noRaycast}>
        <boxGeometry args={[S.across, S.base, S.along]} />
        <Toon color="#ffffff" />
      </mesh>
      <mesh position-y={S.base + 0.02} raycast={noRaycast}>
        <boxGeometry args={[S.across - 0.2, 0.06, S.along - 0.2]} />
        <Toon color="#3b1f5c" />
      </mesh>
      <group ref={glass}>
        <mesh position-y={S.base + (S.top - S.base) / 2} raycast={noRaycast}>
          <boxGeometry args={[S.across, S.top - S.base, S.along]} />
          <meshStandardMaterial color="#d8f3ff" transparent opacity={0.22} roughness={0.02} metalness={0.1} depthWrite={false} />
        </mesh>
        <mesh position-y={S.base + (S.top - S.base) / 2} raycast={noRaycast}>
          <boxGeometry args={[S.across, S.top - S.base, S.along]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.5} />
        </mesh>
      </group>
      <group ref={items}>
        {things.map((th, k) => (
          <group key={k} position={[0, top, th.z]}>
            {th.kind === 0 && (
              <>
                <mesh raycast={noRaycast}>
                  <torusGeometry args={[0.22, 0.06, 8, 18]} />
                  <Toon color="#ffcc33" emissive="#3a2600" />
                </mesh>
                <mesh position-y={0.3} raycast={noRaycast}>
                  <octahedronGeometry args={[0.13]} />
                  <meshBasicMaterial color={th.gem} toneMapped={false} />
                </mesh>
              </>
            )}
            {th.kind === 1 && (
              <>
                <mesh rotation-x={Math.PI / 2} position-y={-0.15} raycast={noRaycast}>
                  <torusGeometry args={[0.32, 0.03, 6, 24]} />
                  <Toon color="#ffcc33" />
                </mesh>
                <mesh position={[0, -0.12, 0.32]} raycast={noRaycast}>
                  <octahedronGeometry args={[0.12]} />
                  <meshBasicMaterial color={th.gem} toneMapped={false} />
                </mesh>
              </>
            )}
            {th.kind === 2 && (
              <>
                <mesh rotation-x={Math.PI / 2} raycast={noRaycast}>
                  <cylinderGeometry args={[0.2, 0.2, 0.08, 16]} />
                  <Toon color="#e6ebf0" />
                </mesh>
                <mesh raycast={noRaycast}>
                  <torusGeometry args={[0.24, 0.05, 6, 18]} />
                  <Toon color="#ffcc33" />
                </mesh>
              </>
            )}
            {th.kind === 3 && (
              <mesh raycast={noRaycast}>
                <octahedronGeometry args={[0.24]} />
                <meshBasicMaterial color={th.gem} toneMapped={false} />
              </mesh>
            )}
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * The Big Rock: a giant diamond floating over a stand, under a glass dome,
 * fenced in by sweeping red lasers. Once grabbed, the lasers flicker off and
 * the dome lifts away.
 */
function BigRock() {
  const P = JEWELRY_PLAN;
  const gem = useRef<THREE.Group>(null);
  const dome = useRef<THREE.Mesh>(null);
  const beams = useRef<(THREE.Mesh | null)[]>([]);
  const L = P.lasers;
  const posts: [number, number][] = [
    [L.lx0, L.lz0],
    [L.lx1, L.lz0],
    [L.lx1, L.lz1],
    [L.lx0, L.lz1],
  ];
  // The beams: along each side of the fence, at three heights.
  const lines = posts.flatMap((p, i) => {
    const q = posts[(i + 1) % 4];
    return [0, 1, 2].map((h) => ({ x: (p[0] + q[0]) / 2, z: (p[1] + q[1]) / 2, len: Math.hypot(q[0] - p[0], q[1] - p[1]), turn: Math.atan2(q[0] - p[0], q[1] - p[1]), h }));
  });
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const at = game.taken.get("rock");
    const gone = at !== undefined ? game.now - at : -1;
    if (gem.current) {
      gem.current.visible = gone < 0;
      gem.current.rotation.y += delta * 0.9;
      gem.current.position.y = 4.2 + Math.sin(t * 1.8) * 0.15;
    }
    if (dome.current) dome.current.position.y = 2.7 + (gone < 0 ? 0 : ease(clamp01(gone / 0.8)) * 3.5);
    // The laser fence (heights from heist.ts, so what you see is what kills you).
    const heights = jewelryLasers(game.now);
    const on = jewelryLasersOn();
    beams.current.forEach((b, i) => {
      if (!b) return;
      // Off once it's taken (with a quick flicker first).
      b.visible = on || (gone >= 0 && gone < 0.6 && Math.sin(gone * 60 + i) > 0);
      b.position.y = heights[lines[i].h];
    });
  });
  return (
    <group position={[0, SHOP_FLOOR, 0]}>
      <group position={[P.rock.lx, 0, P.rock.lz]}>
        <mesh position-y={1.1} raycast={noRaycast}>
          <cylinderGeometry args={[1.1, 1.4, 2.2, 20]} />
          <Toon color="#ffffff" />
        </mesh>
        <mesh position-y={2.25} raycast={noRaycast}>
          <cylinderGeometry args={[1.25, 1.25, 0.12, 20]} />
          <Toon color="#ffcc33" />
        </mesh>
        <group ref={gem} position-y={4.2}>
          <Diamond size={0.75} color="#9ff3ff" />
        </group>
        <mesh ref={dome} position-y={2.7} raycast={noRaycast}>
          <sphereGeometry args={[1.5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#e4f8ff" transparent opacity={0.25} roughness={0.02} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {posts.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position-y={1.6} raycast={noRaycast}>
            <cylinderGeometry args={[0.13, 0.16, 3.2, 8]} />
            <Toon color="#3b4046" />
          </mesh>
          <mesh position-y={3.3} raycast={noRaycast}>
            <sphereGeometry args={[0.18, 10, 8]} />
            <meshBasicMaterial color="#ff2a1a" toneMapped={false} />
          </mesh>
        </group>
      ))}
      {lines.map((l, i) => (
        <mesh
          key={i}
          ref={(m) => {
            beams.current[i] = m;
          }}
          position={[l.x, 1.2, l.z]}
          rotation-y={l.turn}
          raycast={noRaycast}
        >
          <boxGeometry args={[0.05, 0.05, l.len]} />
          <meshBasicMaterial color="#ff2a1a" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Little star twinkles round the cases and the Big Rock. */
function Sparkles() {
  const tex = useCanvas(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(220,250,255,0.6)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "white";
    g.fillRect(30, 2, 4, 60);
    g.fillRect(2, 30, 60, 4);
  });
  const spots = useMemo(() => {
    const rand = seededRandom(55);
    const P = JEWELRY_PLAN;
    const list: { p: [number, number, number]; phase: number; id: string }[] = [];
    P.cases.forEach((c, i) => {
      for (let k = 0; k < 3; k++) list.push({ p: [c.lx + (rand() - 0.5) * 1.4, 3.1 + rand() * 0.4, c.lz + (rand() - 0.5) * 2.6], phase: rand() * 10, id: `case-${i}` });
    });
    for (let k = 0; k < 6; k++) list.push({ p: [P.rock.lx + (rand() - 0.5) * 2, 4.4 + (rand() - 0.5) * 1.6, P.rock.lz + (rand() - 0.5) * 2], phase: rand() * 10, id: "rock" });
    return list;
  }, []);
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    refs.current.forEach((s, i) => {
      if (!s) return;
      const k = Math.max(0, Math.sin(t * 2.2 + spots[i].phase));
      s.scale.setScalar(0.1 + k * k * 0.9);
      s.visible = !isTaken(spots[i].id);
    });
  });
  return (
    <group position-y={SHOP_FLOOR}>
      {spots.map((s, i) => (
        <sprite
          key={i}
          position={s.p}
          ref={(m) => {
            refs.current[i] = m;
          }}
        >
          <spriteMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
}


/** "CLOSED 29:41": floats over a place that's been robbed, counting down until it reopens. */
export function ClosedSign({ site, height }: { site: SiteKey; height: number }) {
  const sprite = useRef<THREE.Sprite>(null);
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 160;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, texture: t };
  }, []);
  const last = useRef("");
  useFrame(() => {
    const s = sprite.current;
    if (!s) return;
    const closed = isClosed(site);
    s.visible = closed;
    if (!closed) return;
    const left = closedFor(site);
    const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    if (text === last.current) return;
    last.current = text;
    const g = canvas.getContext("2d")!;
    g.clearRect(0, 0, 512, 160);
    g.fillStyle = "#c81e1e";
    g.beginPath();
    g.roundRect(6, 6, 500, 148, 26);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = "#ffffff";
    g.stroke();
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.font = "800 46px sans-serif";
    g.fillText("CLOSED · ROBBED", 256, 64);
    g.font = "800 60px monospace";
    g.fillText(text, 256, 128);
    texture.needsUpdate = true;
  });
  const c = SITE_CENTER[site];
  return (
    <sprite ref={sprite} position={[c.x, height, c.z]} scale={[16, 5, 1]} visible={false}>
      <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}
