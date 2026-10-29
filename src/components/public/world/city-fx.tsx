"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { player } from "./bump";
import { drive } from "./drive";
import { game, loadMoney, tick, type Fx } from "./heist";
import { noRaycast, toonRamp } from "./paint";
import { puff } from "./smoke";

/*
 * Runs the city game every frame (heist.ts: what you can do where, the
 * chase), and shows its effects: dollar bills and gold bars bursting out and
 * flying into your pocket (the camera), gems sparkling out of smashed cases,
 * glass shards bouncing across the floor, drill sparks, and the Big Rock
 * zooming into your bag. Each kind of bit is one instanced mesh.
 */

export function CityGame({ calm }: { calm: boolean }) {
  useEffect(() => loadMoney(), []);
  useFrame((state, delta) => {
    const you = drive.active ? { x: drive.pos.x, z: drive.pos.z } : { x: player.x, z: player.z };
    tick(state.clock.elapsedTime, Math.min(delta, 0.1), { ...you, onFoot: player.onFoot, driving: drive.active });
    if (calm) game.shake = 0;
  });
  return <Effects calm={calm} />;
}

type Bit = { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; spin: number; age: number; life: number; size: number; color: number; home: boolean };

const MAX = { bills: 260, gold: 120, gems: 200, shards: 260, sparks: 160 };
type Kind = keyof typeof MAX;
const GEM_COLORS = ["#ff4d6d", "#4dd2ff", "#7cff8a", "#c77dff", "#ffd60a", "#ffffff", "#ff9ec4"].map((c) => new THREE.Color(c));

const dummy = new THREE.Object3D();
const toCam = new THREE.Vector3();
const fwd = new THREE.Vector3();

function spawn(list: Bit[], kind: Kind, fx: Fx) {
  for (let i = 0; i < fx.count; i++) {
    if (list.length >= MAX[kind]) list.shift();
    const a = Math.random() * Math.PI * 2;
    const up = kind === "sparks" ? 2 + Math.random() * 5 : kind === "shards" ? 2 + Math.random() * 5 : 5 + Math.random() * 6;
    const out = kind === "sparks" ? 3 + Math.random() * 7 : kind === "shards" ? 2 + Math.random() * 6 : 2 + Math.random() * 4;
    list.push({
      x: fx.x + (Math.random() - 0.5) * 1.2,
      y: fx.y + (Math.random() - 0.5) * 0.6,
      z: fx.z + (Math.random() - 0.5) * 1.2,
      vx: Math.cos(a) * out,
      vy: up,
      vz: Math.sin(a) * out,
      rx: Math.random() * 6,
      ry: Math.random() * 6,
      spin: 4 + Math.random() * 10,
      age: -Math.random() * 0.15,
      life: kind === "sparks" ? 0.4 + Math.random() * 0.4 : kind === "shards" ? 2.2 + Math.random() : 3,
      size: kind === "shards" ? 0.6 + Math.random() * 0.9 : 0.8 + Math.random() * 0.5,
      color: Math.floor(Math.random() * GEM_COLORS.length),
      home: kind === "bills" || kind === "gold" || kind === "gems",
    });
  }
}

function Effects({ calm }: { calm: boolean }) {
  const lists = useRef<Record<Kind, Bit[]>>({ bills: [], gold: [], gems: [], shards: [], sparks: [] });
  const meshes = useRef<Partial<Record<Kind, THREE.InstancedMesh | null>>>({});
  const rock = useRef<THREE.Group>(null);
  const rockAt = useRef<{ x: number; y: number; z: number; t: number } | null>(null);
  const shard = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.5, 0, -0.35, -0.3, 0, 0.4, -0.25, 0], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => shard.dispose(), [shard]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const cam = state.camera;
    cam.getWorldDirection(fwd);
    // The spot just in front of you that loot flies into.
    toCam.copy(cam.position).addScaledVector(fwd, 1.6).add(new THREE.Vector3(0, -0.6, 0));

    // New effects from the game.
    while (game.fx.length) {
      const fx = game.fx.shift()!;
      if (calm && fx.kind !== "rock") continue;
      if (fx.kind === "cash") spawn(lists.current.bills, "bills", fx);
      else if (fx.kind === "gold") spawn(lists.current.gold, "gold", fx);
      else if (fx.kind === "gems") spawn(lists.current.gems, "gems", fx);
      else if (fx.kind === "shards") spawn(lists.current.shards, "shards", fx);
      else if (fx.kind === "sparks") spawn(lists.current.sparks, "sparks", fx);
      else if (fx.kind === "blast") for (let i = 0; i < fx.count; i++) puff(fx.x, fx.y, fx.z);
      else if (fx.kind === "rock") rockAt.current = { x: fx.x, y: fx.y, z: fx.z, t: 0 };
    }

    for (const kind of Object.keys(MAX) as Kind[]) {
      const list = lists.current[kind];
      const m = meshes.current[kind];
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        b.age += dt;
        if (b.age < 0) continue;
        if (b.home && b.age > 0.45) {
          // Fly into your pocket.
          const k = 1 - Math.exp(-7 * dt);
          b.vx += ((toCam.x - b.x) * 9 - b.vx) * k;
          b.vy += ((toCam.y - b.y) * 9 - b.vy) * k;
          b.vz += ((toCam.z - b.z) * 9 - b.vz) * k;
          if (Math.hypot(toCam.x - b.x, toCam.y - b.y, toCam.z - b.z) < 0.7) b.age = b.life;
        } else {
          b.vy -= (kind === "bills" ? 9 : 22) * dt;
          if (kind === "bills") {
            // Paper flutters: lots of air.
            b.vx *= 1 - 1.5 * dt;
            b.vz *= 1 - 1.5 * dt;
          }
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        if (b.y < 0.5 && !b.home) {
          // Bounce on the floor, losing most of the speed.
          b.y = 0.5;
          b.vy = Math.abs(b.vy) * 0.3;
          b.vx *= 0.6;
          b.vz *= 0.6;
          b.spin *= 0.5;
        }
        b.rx += b.spin * dt;
        b.ry += b.spin * 0.7 * dt;
        if (b.age >= b.life) list.splice(i, 1);
      }
      if (!m) continue;
      for (let i = 0; i < MAX[kind]; i++) {
        const b = list[i];
        if (!b || b.age < 0) {
          dummy.scale.setScalar(0);
          dummy.position.set(0, -50, 0);
        } else {
          const fade = kind === "shards" ? Math.min(1, (b.life - b.age) * 2) : kind === "sparks" ? 1 - b.age / b.life : 1;
          dummy.position.set(b.x, b.y, b.z);
          dummy.rotation.set(b.rx, b.ry, 0);
          dummy.scale.setScalar(b.size * Math.max(0, fade));
        }
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        if (kind === "gems" && b) m.setColorAt(i, GEM_COLORS[b.color]);
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // The Big Rock: pops up out of its dome, spins, and zooms into you.
    const r = rock.current;
    const ra = rockAt.current;
    if (r) {
      r.visible = Boolean(ra);
      if (ra) {
        ra.t += dt;
        const up = Math.min(1, ra.t / 0.6);
        const fly = Math.max(0, (ra.t - 0.9) / 0.6);
        r.position.set(ra.x, ra.y + up * 2.2, ra.z).lerp(toCam, Math.min(1, fly * fly));
        r.rotation.y += dt * (6 + ra.t * 10);
        r.scale.setScalar(0.75 * (1 + up * 0.6) * (1 - Math.min(1, fly) * 0.7));
        if (fly >= 1) rockAt.current = null;
      }
    }
  });

  const set = (kind: Kind) => (m: THREE.InstancedMesh | null) => {
    meshes.current[kind] = m;
  };
  return (
    <group>
      <instancedMesh ref={set("bills")} args={[undefined, undefined, MAX.bills]} frustumCulled={false} raycast={noRaycast}>
        <boxGeometry args={[0.7, 0.02, 0.32]} />
        <meshToonMaterial color="#6cc04a" gradientMap={toonRamp()} />
      </instancedMesh>
      <instancedMesh ref={set("gold")} args={[undefined, undefined, MAX.gold]} frustumCulled={false} raycast={noRaycast}>
        <boxGeometry args={[0.5, 0.25, 0.26]} />
        <meshToonMaterial color="#ffcc33" emissive="#4a3200" gradientMap={toonRamp()} />
      </instancedMesh>
      <instancedMesh ref={set("gems")} args={[undefined, undefined, MAX.gems]} frustumCulled={false} raycast={noRaycast}>
        <octahedronGeometry args={[0.18]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={set("shards")} args={[shard, undefined, MAX.shards]} frustumCulled={false} raycast={noRaycast}>
        <meshStandardMaterial color="#dff6ff" transparent opacity={0.7} roughness={0.05} metalness={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={set("sparks")} args={[undefined, undefined, MAX.sparks]} frustumCulled={false} raycast={noRaycast}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshBasicMaterial color="#ffd23a" toneMapped={false} />
      </instancedMesh>
      <group ref={rock} visible={false}>
        <mesh position-y={0.2} raycast={noRaycast}>
          <cylinderGeometry args={[0.55, 1, 0.4, 8]} />
          <meshStandardMaterial color="#9ff3ff" emissive="#9ff3ff" emissiveIntensity={0.3} roughness={0.15} metalness={0.1} flatShading />
        </mesh>
        <mesh position-y={-0.6} rotation-x={Math.PI} raycast={noRaycast}>
          <coneGeometry args={[1, 1.2, 8]} />
          <meshStandardMaterial color="#9ff3ff" emissive="#9ff3ff" emissiveIntensity={0.2} roughness={0.15} metalness={0.1} flatShading />
        </mesh>
      </group>
    </group>
  );
}
