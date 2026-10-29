"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { player } from "./bump";
import { BANK, BANK_PLAN, JEWELRY, JEWELRY_PLAN, LOOT, toWorld, type Loot, type Site } from "./city-layout";
import { drive } from "./drive";
import { SITE_CENTER, VAULT, closedFor, game, isClosed, isTaken, jewelryLasers, jewelryLasersOn, vaultLasers, vaultLasersOn, vaultTime } from "./heist";
import type { SiteKey } from "./city-layout";
import { canvasTexture, noRaycast, seededRandom, signTexture, toonRamp } from "./paint";
import { puff } from "./smoke";
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

const Toon = ({ color, emissive }: { color: string; emissive?: string }) => <meshToonMaterial color={color} emissive={emissive ?? "#000000"} gradientMap={toonRamp()} />;

/** A box from (x0, y0, z0) to (x1, y1, z1), in the building's own frame. */
function Slab({ x0, x1, y0, y1, z0, z1, color, cast = false, children }: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; color?: string; cast?: boolean; children?: React.ReactNode }) {
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} castShadow={cast} raycast={noRaycast}>
      <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
      {children ?? <Toon color={color ?? "#ffffff"} />}
    </mesh>
  );
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const backOut = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** The floors inside, just above the city's paving (you walk at the same height everywhere, so they stay low). */
const BANK_FLOOR = 0.42;
const SHOP_FLOOR = 0.32;

// ---- Pictures drawn once ---------------------------------------------------------------------

function useCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
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

function checker(g: CanvasRenderingContext2D, a: string, b: string, line: string) {
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

/**
 * A cartoon person (the same build as the people out walking). Puts their
 * hands up and trembles while `scared()` says so.
 */
function Person({ position, turn = 0, shirt, skin, hair = "#2a1a12", tie, scared }: { position: [number, number, number]; turn?: number; shirt: string; skin: string; hair?: string; tie?: string; scared: () => boolean }) {
  const s = 0.86;
  const arms = useRef<(THREE.Group | null)[]>([]);
  const body = useRef<THREE.Group>(null);
  const up = useRef(0);
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    up.current = THREE.MathUtils.damp(up.current, scared() ? 1 : 0, 6, delta);
    const u = up.current;
    arms.current.forEach((a, i) => {
      if (!a) return;
      // Down by their sides (swinging a little), or straight up.
      a.rotation.x = Math.PI * 0.95 * u + Math.sin(t * 1.3 + i) * 0.05 * (1 - u);
      a.rotation.z = (i ? -1 : 1) * 0.28 * u;
    });
    if (body.current) {
      body.current.position.y = Math.abs(Math.sin(t * 1.6)) * 0.03 + (u > 0.5 ? Math.sin(t * 40) * 0.03 : 0);
      body.current.rotation.y = u > 0.5 ? Math.sin(t * 3) * 0.12 : 0;
    }
  });
  return (
    <group position={position} rotation-y={turn}>
      <group ref={body} scale={s}>
        <mesh position-y={2.3} raycast={noRaycast}>
          <boxGeometry args={[0.95, 1.6, 0.55]} />
          <Toon color={shirt} />
        </mesh>
        {tie && (
          <mesh position={[0, 2.55, 0.29]} raycast={noRaycast}>
            <boxGeometry args={[0.18, 0.9, 0.04]} />
            <Toon color={tie} />
          </mesh>
        )}
        <mesh position-y={3.55} raycast={noRaycast}>
          <sphereGeometry args={[0.42, 16, 12]} />
          <Toon color={skin} />
        </mesh>
        <mesh position={[0, 3.72, -0.05]} raycast={noRaycast}>
          <sphereGeometry args={[0.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <Toon color={hair} />
        </mesh>
        {/* Eyes */}
        {[-1, 1].map((k) => (
          <mesh key={k} position={[k * 0.15, 3.6, 0.38]} raycast={noRaycast}>
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshBasicMaterial color="#1b1d21" />
          </mesh>
        ))}
        {[-1, 1].map((k) => (
          <mesh key={`l${k}`} position={[k * 0.2, 0.75, 0]} raycast={noRaycast}>
            <boxGeometry args={[0.3, 1.5, 0.32]} />
            <Toon color="#2b2f36" />
          </mesh>
        ))}
        {[-1, 1].map((k, i) => (
          <group
            key={`a${k}`}
            position={[k * 0.6, 3.0, 0]}
            ref={(g) => {
              arms.current[i] = g;
            }}
          >
            <mesh position-y={-0.62} raycast={noRaycast}>
              <boxGeometry args={[0.22, 1.25, 0.24]} />
              <Toon color={shirt} />
            </mesh>
            <mesh position-y={-1.3} raycast={noRaycast}>
              <sphereGeometry args={[0.15, 8, 6]} />
              <Toon color={skin} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ---- Sliding glass doors that open as you walk up --------------------------------------------

function SlidingDoors({ site, half, height }: { site: Site; half: number; height: number }) {
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
function AlarmLight({ position, turn = 0, on }: { position: [number, number, number]; turn?: number; on: () => boolean }) {
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
function useTakenAnim(id: string) {
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
// The bank
// ======================================================================================

export function Bank() {
  const P = BANK_PLAN;
  const W = P.halfW;
  const D = P.depth;
  const H = P.height;
  const t = P.wall;
  const marble = useCanvas(256, 256, (g) => checker(g, "#f4efe6", "#d9cfbf", "rgba(150,130,110,0.25)"), [Math.round((W * 2) / 5), Math.round(D / 5)]);
  const steel = useCanvas(128, 128, (g) => {
    g.fillStyle = "#9aa4ae";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#7d8792";
    g.lineWidth = 3;
    g.strokeRect(2, 2, 124, 124);
    g.fillStyle = "#c3cbd3";
    for (const [x, y] of [
      [10, 10],
      [118, 10],
      [10, 118],
      [118, 118],
    ])
      g.fillRect(x - 3, y - 3, 6, 6);
  }, [5, 3]);
  const lockers = useCanvas(256, 256, (g) => {
    g.fillStyle = "#8f99a3";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 6; x++) {
        g.fillStyle = (x + y) % 3 ? "#b7c0c9" : "#a9b3bd";
        g.fillRect(x * 42 + 3, y * 32 + 3, 37, 26);
        g.fillStyle = "#e0b43a";
        g.beginPath();
        g.arc(x * 42 + 31, y * 32 + 16, 3.5, 0, Math.PI * 2);
        g.fill();
      }
  }, [2, 1]);
  const sign = useMemo(() => signTexture("City Bank", { bg: "#0b6b67", fg: "#ffd21f", height: 128 }), []);
  const teller = useMemo(() => [1, 2, 3].map((n) => signTexture(`Teller ${n}`, { bg: "#1b1d21", fg: "#ffd21f", height: 64, font: "body" })), []);
  const letters = useMemo(() => letterGeometry("CITY BANK", 1.5, 0.35), []);
  const dollar = useMemo(() => letterGeometry("$", 3.4, 0.6), []);
  const pediment = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-19, 0);
    s.lineTo(19, 0);
    s.lineTo(0, 5.5);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 5, bevelEnabled: false });
    return g;
  }, []);
  useEffect(() => () => pediment.dispose(), [pediment]);

  const alarmOn = () => game.sites.bank.alarm;
  const cream = "#f5ead2";
  const trim = "#fffaf0";

  return (
    <group position={[BANK.x, 0, BANK.z]} rotation-y={BANK.turn}>
      {/* ---- The building ---- */}
      <Slab x0={-W - 1} x1={W + 1} y0={0} y1={BANK_FLOOR - 0.02} z0={-D - 1} z1={0.4} color="#c9c2b6" />
      <Slab x0={-W} x1={-P.doorHalf} y0={0} y1={H} z0={-t} z1={0} color={cream} cast />
      <Slab x0={P.doorHalf} x1={W} y0={0} y1={H} z0={-t} z1={0} color={cream} cast />
      <Slab x0={-P.doorHalf} x1={P.doorHalf} y0={P.doorHeight} y1={H} z0={-t} z1={0} color={cream} cast />
      <Slab x0={-W} x1={-W + t} y0={0} y1={H} z0={-D} z1={0} color={cream} cast />
      <Slab x0={W - t} x1={W} y0={0} y1={H} z0={-D} z1={0} color={cream} cast />
      <Slab x0={-W} x1={W} y0={0} y1={H} z0={-D} z1={-D + t} color={cream} cast />
      {/* Roof, and a white ledge round it */}
      <Slab x0={-W - 0.6} x1={W + 0.6} y0={H} y1={H + 0.8} z0={-D - 0.6} z1={0.6} color="#d9cba8" cast />
      <Slab x0={-W - 1} x1={W + 1} y0={H - 1.2} y1={H} z0={-D - 1} z1={1} color={trim} />
      {/* Gold dome with a little lantern on top */}
      <group position={[0, H + 0.8, -D / 2]}>
        <mesh castShadow raycast={noRaycast}>
          <cylinderGeometry args={[7.6, 7.6, 1.6, 32]} />
          <Toon color={trim} />
        </mesh>
        <mesh position-y={0.8} castShadow raycast={noRaycast}>
          <sphereGeometry args={[7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <Toon color="#ffcc33" emissive="#3a2600" />
        </mesh>
        <mesh position-y={8.4} raycast={noRaycast}>
          <cylinderGeometry args={[0.8, 1, 1.6, 12]} />
          <Toon color={trim} />
        </mesh>
        <mesh position-y={10} raycast={noRaycast}>
          <sphereGeometry args={[0.9, 14, 10]} />
          <Toon color="#ffcc33" emissive="#3a2600" />
        </mesh>
      </group>
      {/* Tall windows down both sides (seen from inside and out) */}
      {[-1, 1].flatMap((side) =>
        [-8, -15, -26].map((z) => (
          <mesh key={`${side}${z}`} position={[side * W, 6.5, z]} raycast={noRaycast}>
            <boxGeometry args={[t + 0.3, 7, 3.2]} />
            <meshStandardMaterial color="#9fd3f0" roughness={0.15} metalness={0.3} />
          </mesh>
        )),
      )}

      {/* ---- The porch: steps, columns, a frieze with the name, and a triangle on top ---- */}
      {[0, 1, 2].map((k) => (
        <Slab key={k} x0={-P.steps.halfW + k} x1={P.steps.halfW - k} y0={0} y1={0.14 + k * 0.14} z0={0} z1={P.steps.depth - k * 1.3} color="#e7e1d6" />
      ))}
      {P.columns.map((x) => (
        <group key={x} position={[x, 0, P.columnZ]}>
          <mesh position-y={1.3} raycast={noRaycast}>
            <boxGeometry args={[2.2, 0.8, 2.2]} />
            <Toon color={trim} />
          </mesh>
          <mesh position-y={7.1} castShadow raycast={noRaycast}>
            <cylinderGeometry args={[0.8, 0.9, 11.2, 16]} />
            <Toon color={trim} />
          </mesh>
          <mesh position-y={12.9} raycast={noRaycast}>
            <boxGeometry args={[2.2, 0.6, 2.2]} />
            <Toon color={trim} />
          </mesh>
        </group>
      ))}
      <Slab x0={-19} x1={19} y0={13.2} y1={H + 0.4} z0={-0.2} z1={5} color={cream} cast />
      <mesh geometry={pediment} position={[0, H + 0.4, -0.2]} castShadow raycast={noRaycast}>
        <Toon color={cream} />
      </mesh>
      <mesh geometry={dollar} position={[0, H + 1.2, 4.9]} raycast={noRaycast}>
        <Toon color="#ffcc33" emissive="#3a2600" />
      </mesh>
      <mesh geometry={letters} position={[0, 13.55, 5.1]} raycast={noRaycast}>
        <Toon color="#ffcc33" emissive="#3a2600" />
      </mesh>
      <SlidingDoors site={BANK} half={P.doorHalf} height={P.doorHeight} />
      <AlarmLight position={[-W + 1.2, H + 1.4, 1.2]} on={alarmOn} />
      <AlarmLight position={[W - 1.2, H + 1.4, 1.2]} on={alarmOn} />

      {/* ---- Inside: marble floor, ceiling, green marble round the walls ---- */}
      <mesh rotation-x={-Math.PI / 2} position={[0, BANK_FLOOR, -D / 2]} raycast={noRaycast}>
        <planeGeometry args={[W * 2 - t * 2, D - t * 2]} />
        <meshToonMaterial map={marble} gradientMap={toonRamp()} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, H - 0.05, -D / 2]} raycast={noRaycast}>
        <planeGeometry args={[W * 2, D]} />
        <Toon color="#fff4dc" />
      </mesh>
      <Slab x0={-W + t} x1={-W + t + 0.15} y0={0} y1={2.8} z0={P.vaultWall.lz1} z1={-t} color="#2d6a4f" />
      <Slab x0={W - t - 0.15} x1={W - t} y0={0} y1={2.8} z0={P.vaultWall.lz1} z1={-t} color="#2d6a4f" />
      <Slab x0={-W + t} x1={-P.doorHalf} y0={0} y1={2.8} z0={-t - 0.15} z1={-t} color="#2d6a4f" />
      <Slab x0={P.doorHalf} x1={W - t} y0={0} y1={2.8} z0={-t - 0.15} z1={-t} color="#2d6a4f" />
      {/* Marble pillars */}
      {P.pillars.map(([x, z]) => (
        <group key={x} position={[x, BANK_FLOOR, z]}>
          <mesh position-y={(H - BANK_FLOOR) / 2} raycast={noRaycast}>
            <cylinderGeometry args={[0.95, 0.95, H - BANK_FLOOR, 18]} />
            <Toon color="#f7f1e6" />
          </mesh>
          <mesh position-y={0.4} raycast={noRaycast}>
            <cylinderGeometry args={[1.3, 1.3, 0.8, 18]} />
            <Toon color="#ffcc33" />
          </mesh>
        </group>
      ))}
      {/* Hanging lamps */}
      {[-10, 10].map((x) => (
        <group key={x} position={[x, H - 0.1, -8]}>
          <mesh position-y={-1.5} raycast={noRaycast}>
            <cylinderGeometry args={[0.05, 0.05, 3, 6]} />
            <meshBasicMaterial color="#3b4046" />
          </mesh>
          <mesh position-y={-3.4} raycast={noRaycast}>
            <sphereGeometry args={[0.9, 16, 12]} />
            <meshBasicMaterial color="#fff3cf" toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* Velvet ropes for the queue */}
      {[-6, -2, 2, 6].map((x) => (
        <mesh key={x} position={[x, BANK_FLOOR + 0.7, -9.5]} raycast={noRaycast}>
          <cylinderGeometry args={[0.1, 0.18, 1.4, 8]} />
          <Toon color="#ffcc33" />
        </mesh>
      ))}
      <mesh position={[0, BANK_FLOOR + 1.25, -9.5]} raycast={noRaycast}>
        <boxGeometry args={[12, 0.12, 0.12]} />
        <Toon color="#b8323a" />
      </mesh>
      {/* Plants by the door */}
      {[-6.5, 6.5].map((x) => (
        <group key={x} position={[x, BANK_FLOOR, -2.4]}>
          <mesh position-y={0.6} raycast={noRaycast}>
            <cylinderGeometry args={[0.7, 0.5, 1.2, 12]} />
            <Toon color="#b5653a" />
          </mesh>
          <mesh position-y={2.1} raycast={noRaycast}>
            <icosahedronGeometry args={[1.1, 1]} />
            <Toon color="#4c9a3b" />
          </mesh>
        </group>
      ))}

      {/* ---- The counter, with glass above it and the tellers behind ---- */}
      <Slab x0={P.counter.lx0} x1={P.counter.lx1} y0={0} y1={BANK_FLOOR + P.counter.height} z0={P.counter.lz0} z1={P.counter.lz1} color="#8a5a35" />
      <Slab x0={P.counter.lx0 - 0.2} x1={P.counter.lx1 + 0.2} y0={BANK_FLOOR + P.counter.height} y1={BANK_FLOOR + 0.25 + P.counter.height} z0={P.counter.lz0 - 0.2} z1={P.counter.lz1 + 0.3} color="#f4efe6" />
      <mesh position={[0, 4.4, -14]} raycast={noRaycast}>
        <boxGeometry args={[24, 2.6, 0.08]} />
        <meshStandardMaterial color="#d8f0ff" transparent opacity={0.22} roughness={0.05} depthWrite={false} />
      </mesh>
      {[-12, -3.5, 3.5, 12].map((x) => (
        <mesh key={x} position={[x, 4.4, -14]} raycast={noRaycast}>
          <boxGeometry args={[0.2, 2.6, 0.2]} />
          <Toon color="#c9a227" />
        </mesh>
      ))}
      {P.tellers.map((x, i) => (
        <mesh key={x} position={[x, 6.1, -14]} raycast={noRaycast}>
          <planeGeometry args={[2.4, 2.4 / teller[i].aspect]} />
          <meshBasicMaterial map={teller[i].texture} transparent toneMapped={false} />
        </mesh>
      ))}
      {P.tellers.map((x, i) => (
        <Person key={x} position={[x, BANK_FLOOR, P.tellerZ]} shirt={["#13a8a0", "#3d6fe0", "#7b5cd6"][i]} skin={["#e0ac83", "#8d5a3b", "#f1c7a5"][i]} hair={i === 1 ? "#1b1d21" : "#6b4423"} tie={i === 1 ? "#e5483b" : undefined} scared={alarmOn} />
      ))}
      <AlarmLight position={[-W + 1.2, 11, -6]} turn={Math.PI / 2} on={alarmOn} />
      <AlarmLight position={[W - 1.2, 11, -6]} turn={-Math.PI / 2} on={alarmOn} />

      {/* ---- The vault: a steel wall with a round door, and the vault room behind ---- */}
      <VaultWall />
      <mesh position={[0, 12.2, P.vaultWall.lz1 + 0.06]} raycast={noRaycast}>
        <planeGeometry args={[9, 9 / sign.aspect]} />
        <meshBasicMaterial map={sign.texture} transparent toneMapped={false} />
      </mesh>
      <VaultDoor />
      <mesh rotation-x={-Math.PI / 2} position={[0, BANK_FLOOR + 0.01, (P.vaultWall.lz0 - D + t) / 2]} raycast={noRaycast}>
        <planeGeometry args={[W * 2 - t * 2, P.vaultWall.lz0 + D - t]} />
        <meshToonMaterial map={steel} gradientMap={toonRamp()} />
      </mesh>
      {/* Safe-deposit boxes on both side walls and the back */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (W - t - 0.06), 5, (P.vaultWall.lz0 - D + t) / 2]} rotation-y={(-side * Math.PI) / 2} raycast={noRaycast}>
          <planeGeometry args={[D - t + P.vaultWall.lz0 - 0.2, 8]} />
          <meshToonMaterial map={lockers} gradientMap={toonRamp()} />
        </mesh>
      ))}
      <mesh position={[0, 5, -D + t + 0.06]} raycast={noRaycast}>
        <planeGeometry args={[W * 2 - t * 2, 8]} />
        <meshToonMaterial map={lockers} gradientMap={toonRamp()} />
      </mesh>
      <AlarmLight position={[0, 11.5, -D + t + 0.6]} on={alarmOn} />
      <VaultGlow />
      <VaultLasers />
      {LOOT.filter((l) => l.site === "bank").map((l) => (
        <BankLoot key={l.id} loot={l} />
      ))}
    </group>
  );
}

/** The steel wall in front of the vault, with a round hole for the door. */
function VaultWall() {
  const P = BANK_PLAN;
  const W = P.halfW;
  const H = P.height;
  const R = P.vaultDoor.radius;
  const frame = useMemo(() => {
    const s = new THREE.Shape();
    const hw = R + 1.4;
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, P.vaultDoor.y * 2 + 1.2);
    s.lineTo(-hw, P.vaultDoor.y * 2 + 1.2);
    s.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, P.vaultDoor.y, R + 0.1, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false, curveSegments: 40 });
  }, [R, P.vaultDoor.y]);
  useEffect(() => () => frame.dispose(), [frame]);
  const z0 = P.vaultWall.lz0;
  const z1 = P.vaultWall.lz1;
  const hw = R + 1.4;
  const top = P.vaultDoor.y * 2 + 1.2;
  return (
    <group>
      <Slab x0={-W + P.wall} x1={-hw} y0={0} y1={H} z0={z0} z1={z1} color="#8d99a6" />
      <Slab x0={hw} x1={W - P.wall} y0={0} y1={H} z0={z0} z1={z1} color="#8d99a6" />
      <Slab x0={-hw} x1={hw} y0={top} y1={H} z0={z0} z1={z1} color="#8d99a6" />
      <mesh geometry={frame} position={[0, 0, z0 - 0.1]} raycast={noRaycast}>
        <Toon color="#6f7b87" />
      </mesh>
      {/* A thick steel ring round the door */}
      <mesh position={[0, P.vaultDoor.y, z1 + 0.15]} raycast={noRaycast}>
        <torusGeometry args={[R + 0.35, 0.45, 12, 48]} />
        <Toon color="#b7c0c9" />
      </mesh>
    </group>
  );
}

/**
 * The round vault door, hinged on its left. While the bank's being robbed:
 * a drill bites into it with sparks, the wheel spins, the bolts round the
 * rim pull in with a clunk, and the door swings open (overshooting a little
 * and settling, like something very heavy).
 */
function VaultDoor() {
  const P = BANK_PLAN;
  const R = P.vaultDoor.radius;
  const hinge = useRef<THREE.Group>(null);
  const wheel = useRef<THREE.Group>(null);
  const bolts = useRef<(THREE.Mesh | null)[]>([]);
  const drill = useRef<THREE.Group>(null);
  const bit = useRef<THREE.Mesh>(null);
  const last = useRef(-1);
  const sparkDue = useRef(0);
  const at = useMemo(() => toWorld(BANK, 0, P.vaultWall.lz1 + 1.2), [P.vaultWall.lz1]);
  const BOLTS = 10;

  useFrame((_, delta) => {
    const vt = vaultTime();
    const prev = last.current;
    last.current = vt;
    // Drill (sparks flying) while the wheel spins.
    const drilling = vt >= 0 && vt < VAULT.spinUntil;
    if (drill.current) {
      drill.current.visible = drilling;
      drill.current.position.z = 1.4 + (drilling ? Math.sin(vt * 60) * 0.05 : 0);
    }
    if (bit.current) bit.current.rotation.y += delta * 40;
    if (drilling) {
      sparkDue.current += delta * 30;
      while (sparkDue.current >= 1) {
        sparkDue.current -= 1;
        game.fx.push({ kind: "sparks", x: at.x + 1.5, y: P.vaultDoor.y + 1.2, z: at.z, count: 2 });
      }
      game.shake = Math.max(game.shake, 0.06);
    }
    // The wheel: spins faster and faster, then stops.
    if (wheel.current) {
      if (vt < 0) wheel.current.rotation.z = 0;
      else wheel.current.rotation.z = -(Math.min(vt, VAULT.spinUntil) ** 2) * 5;
    }
    // Bolts pull back.
    const b = vt < 0 ? 0 : ease(clamp01((vt - VAULT.spinUntil) / (VAULT.boltsUntil - VAULT.spinUntil)));
    bolts.current.forEach((m, i) => {
      if (!m) return;
      const a = (i / BOLTS) * Math.PI * 2;
      const r = R + 0.35 - b * 0.9;
      m.position.set(R + Math.cos(a) * r, Math.sin(a) * r, 0);
    });
    // Swing open.
    const o = vt < 0 ? 0 : backOut(clamp01((vt - VAULT.boltsUntil) / (VAULT.openUntil - VAULT.boltsUntil)));
    if (hinge.current) hinge.current.rotation.y = -1.85 * o;
    // One-off moments: the clunk as the bolts go, and the boom as it swings.
    if (prev < VAULT.spinUntil && vt >= VAULT.spinUntil) game.shake = Math.max(game.shake, 0.45);
    if (prev < VAULT.boltsUntil && vt >= VAULT.boltsUntil) {
      game.shake = Math.max(game.shake, 0.7);
      for (let k = 0; k < 18; k++) puff(at.x + (Math.random() - 0.5) * 8, 0.5 + Math.random() * 8, at.z + 1, 0, 6);
    }
  });

  return (
    <group ref={hinge} position={[-R, P.vaultDoor.y, P.vaultWall.lz1 + 0.55]}>
      <group>
        <mesh position-x={R} rotation-x={Math.PI / 2} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[R, R, 1.1, 48]} />
          <Toon color="#aab4be" />
        </mesh>
        {/* Rings on the front */}
        <mesh position={[R, 0, 0.56]} raycast={noRaycast}>
          <torusGeometry args={[R * 0.78, 0.18, 10, 48]} />
          <Toon color="#d2d9e0" />
        </mesh>
        <mesh position={[R, 0, 0.56]} raycast={noRaycast}>
          <torusGeometry args={[R * 0.45, 0.12, 10, 36]} />
          <Toon color="#d2d9e0" />
        </mesh>
        {/* The big wheel */}
        <group ref={wheel} position={[R, 0, 0.9]}>
          <mesh raycast={noRaycast}>
            <torusGeometry args={[1.7, 0.16, 10, 32]} />
            <Toon color="#ffcc33" />
          </mesh>
          {[0, 1, 2].map((k) => (
            <mesh key={k} rotation-z={(k / 3) * Math.PI} raycast={noRaycast}>
              <boxGeometry args={[3.4, 0.22, 0.22]} />
              <Toon color="#ffcc33" />
            </mesh>
          ))}
          <mesh rotation-x={Math.PI / 2} raycast={noRaycast}>
            <cylinderGeometry args={[0.5, 0.5, 0.5, 16]} />
            <Toon color="#e0b43a" />
          </mesh>
        </group>
        {/* Bolts round the rim */}
        {Array.from({ length: BOLTS }, (_, i) => (
          <mesh
            key={i}
            ref={(m) => {
              bolts.current[i] = m;
            }}
            rotation-z={(i / BOLTS) * Math.PI * 2 - Math.PI / 2}
            raycast={noRaycast}
          >
            <cylinderGeometry args={[0.28, 0.28, 1, 10]} />
            <Toon color="#e6ebf0" />
          </mesh>
        ))}
        {/* Hinges */}
        {[-1, 1].map((k) => (
          <mesh key={k} position={[0, k * R * 0.6, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.45, 0.45, 1.6, 12]} />
            <Toon color="#6f7b87" />
          </mesh>
        ))}
        {/* The robbers' cartoon drill, stuck to the door while it works */}
        <group ref={drill} position={[R + 1.6, 1.2, 1.4]} visible={false}>
          <mesh raycast={noRaycast}>
            <boxGeometry args={[1.6, 1.1, 1.6]} />
            <Toon color="#ff7a2a" />
          </mesh>
          <mesh ref={bit} position={[-0.9, 0, -0.6]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
            <coneGeometry args={[0.3, 1.2, 8]} />
            <Toon color="#c9d1d9" />
          </mesh>
          <mesh position={[0.2, 0.9, 0]} raycast={noRaycast}>
            <boxGeometry args={[0.3, 0.8, 0.3]} />
            <Toon color="#1b1d21" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Golden light pouring out of the vault once the door's open. */
function VaultGlow() {
  const P = BANK_PLAN;
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    const vt = vaultTime();
    const k = vt < 0 ? 0 : clamp01((vt - VAULT.boltsUntil) / 1.2);
    if (mat.current) {
      mat.current.opacity = k * (0.22 + Math.sin(state.clock.elapsedTime * 3) * 0.04);
      mat.current.visible = k > 0.01;
    }
  });
  return (
    <mesh position={[0, P.vaultDoor.y, P.vaultWall.lz1 + 4]} rotation-x={Math.PI / 2} raycast={noRaycast}>
      <cylinderGeometry args={[P.vaultDoor.radius, P.vaultDoor.radius * 1.9, 8, 32, 1, true]} />
      <meshBasicMaterial ref={mat} color="#ffd56a" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

/** A pile of loot in the vault: gold bars stacked up, pallets of cash, or a cash cart. */
function BankLoot({ loot }: { loot: Loot }) {
  const ref = useTakenAnim(loot.id);
  const cash = useMemo(() => signTexture("$100", { bg: "#5aa84a", fg: "#e9f7dc", height: 64 }), []);
  return (
    <group position={[loot.lx, BANK_FLOOR, loot.lz]}>
      <group ref={ref}>
        {loot.kind === "gold" && <GoldStack />}
        {loot.id.startsWith("cash") && (
          <group>
            <mesh position-y={0.3} raycast={noRaycast}>
              <boxGeometry args={[3.2, 0.6, 2.4]} />
              <Toon color="#b0743f" />
            </mesh>
            {[0, 1, 2].flatMap((y) =>
              [-0.75, 0.75].flatMap((x) =>
                [-0.55, 0.55].map((z) => (
                  <group key={`${x}${y}${z}`} position={[x, 0.95 + y * 0.72, z]}>
                    <mesh raycast={noRaycast}>
                      <boxGeometry args={[1.4, 0.7, 1]} />
                      <meshToonMaterial map={cash.texture} gradientMap={toonRamp()} />
                    </mesh>
                    <mesh raycast={noRaycast}>
                      <boxGeometry args={[0.3, 0.72, 1.02]} />
                      <Toon color="#f4f4f0" />
                    </mesh>
                  </group>
                )),
              ),
            )}
          </group>
        )}
        {loot.id.startsWith("cart") && (
          <group>
            <mesh position-y={1.4} raycast={noRaycast}>
              <boxGeometry args={[2.4, 1.6, 1.8]} />
              <meshToonMaterial map={cash.texture} gradientMap={toonRamp()} />
            </mesh>
            <mesh position-y={0.55} raycast={noRaycast}>
              <boxGeometry args={[2.6, 0.12, 2]} />
              <Toon color="#8d99a6" />
            </mesh>
            {[-1, 1].flatMap((x) =>
              [-1, 1].map((z) => (
                <mesh key={`${x}${z}`} position={[x * 1.05, 0.25, z * 0.8]} rotation-z={Math.PI / 2} raycast={noRaycast}>
                  <cylinderGeometry args={[0.25, 0.25, 0.2, 10]} />
                  <Toon color="#1b1d21" />
                </mesh>
              )),
            )}
          </group>
        )}
      </group>
    </group>
  );
}

function GoldStack() {
  const bars = useMemo(() => {
    const list: [number, number, number][] = [];
    const rows = [4, 3, 2, 1];
    rows.forEach((n, y) => {
      for (let i = 0; i < n; i++) for (const z of [-0.45, 0.45]) list.push([(i - (n - 1) / 2) * 0.82, 0.25 + y * 0.48, z]);
    });
    return list;
  }, []);
  return (
    <group>
      {bars.map((p, i) => (
        <mesh key={i} position={p} raycast={noRaycast}>
          <boxGeometry args={[0.78, 0.46, 0.85]} />
          <Toon color="#ffcc33" emissive="#4a3200" />
        </mesh>
      ))}
    </group>
  );
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
        <meshToonMaterial map={stripes} gradientMap={toonRamp()} />
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
        <meshToonMaterial map={carpet} gradientMap={toonRamp()} />
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

/** The vault's two sweeping laser beams (jump over them!), with the emitters on the walls. */
function VaultLasers() {
  const P = BANK_PLAN;
  const beams = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const on = vaultLasersOn();
    vaultLasers(game.now).forEach((b, i) => {
      const g = beams.current[i];
      if (!g) return;
      g.visible = on;
      g.position.set(0, b.y + 0.42, b.lz);
    });
  });
  const width = P.halfW * 2 - P.wall * 2;
  return (
    <group>
      {[0, 1].map((i) => (
        <group
          key={i}
          ref={(g) => {
            beams.current[i] = g;
          }}
          visible={false}
        >
          <mesh raycast={noRaycast}>
            <boxGeometry args={[width, 0.05, 0.05]} />
            <meshBasicMaterial color="#ff2a1a" toneMapped={false} />
          </mesh>
          <mesh raycast={noRaycast}>
            <boxGeometry args={[width, 0.22, 0.22]} />
            <meshBasicMaterial color="#ff2a1a" transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position-x={s * (width / 2 - 0.1)} raycast={noRaycast}>
              <boxGeometry args={[0.3, 0.4, 0.4]} />
              <meshStandardMaterial color="#2a2e33" roughness={0.4} metalness={0.6} />
            </mesh>
          ))}
        </group>
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
