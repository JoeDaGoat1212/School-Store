"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { player } from "./bump";
import { CarModel } from "./car-model";
import { ALL_TIERS, BANK, BANK_PLAN, JEWELRY, JEWELRY_PLAN, toWorld } from "./city-layout";
import { carOnGround, drive } from "./drive";
import { game } from "./heist";
import { COP_LOOK, Humanoid, newPose } from "./humanoid";
import { noRaycast, signTexture } from "./paint";
import { police, type Unit } from "./police-state";

/*
 * Draws the police from police.ts: squad cars with flashing red and blue
 * lights, officers running after you, and the helicopter circling overhead
 * with its searchlight on you. The searchlight stops at rooftops: it never
 * shines through a building.
 */

const glowTexture = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

export function Police() {
  return (
    <group>
      {police.units.map((u, i) => (
        <SquadCar key={i} unit={u} />
      ))}
      {police.units.map((u, i) => (
        <Officer key={`o${i}`} unit={u} />
      ))}
      <Helicopter />
    </group>
  );
}

function SquadCar({ unit }: { unit: Unit }) {
  const group = useRef<THREE.Group>(null);
  const red = useRef<THREE.MeshBasicMaterial>(null);
  const blue = useRef<THREE.MeshBasicMaterial>(null);
  const redGlow = useRef<THREE.SpriteMaterial>(null);
  const blueGlow = useRef<THREE.SpriteMaterial>(null);
  const sign = useMemo(() => signTexture("Police", { bg: "#1d4f91", fg: "#ffffff", height: 64 }), []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    g.visible = unit.on;
    if (!unit.on) return;
    const ground = carOnGround(unit.x, unit.z, unit.heading);
    g.position.set(unit.x, ground.y, unit.z);
    g.rotation.set(ground.pitch, unit.heading, 0, "YXZ");
    const flip = Math.floor(state.clock.elapsedTime * 6) % 2 === 0;
    red.current?.color.set(flip ? "#ff2a1a" : "#5a1410");
    blue.current?.color.set(flip ? "#123a8a" : "#3d8bff");
    if (redGlow.current) redGlow.current.opacity = flip ? 0.9 : 0;
    if (blueGlow.current) blueGlow.current.opacity = flip ? 0 : 0.9;
  });

  return (
    <group ref={group} visible={false}>
      <CarModel color="#f4f6f8" look={unit.look} />
      {/* Black doors and hood stripe, so it reads as a police car */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.715, 1.15, 0.2]} rotation-y={(s * Math.PI) / 2} raycast={noRaycast}>
          <planeGeometry args={[3.8, 0.9]} />
          <meshStandardMaterial color="#14171c" roughness={0.4} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`p${s}`} position={[s * 1.72, 1.2, 0.2]} rotation-y={(s * Math.PI) / 2} raycast={noRaycast}>
          <planeGeometry args={[2.6, 2.6 / sign.aspect]} />
          <meshBasicMaterial map={sign.texture} transparent />
        </mesh>
      ))}
      <group position={[0, 3.12, 0.4]}>
        <mesh raycast={noRaycast}>
          <boxGeometry args={[2.4, 0.2, 0.6]} />
          <meshBasicMaterial color="#1b1d21" />
        </mesh>
        <mesh position={[-0.6, 0.2, 0]} raycast={noRaycast}>
          <boxGeometry args={[1.1, 0.28, 0.5]} />
          <meshBasicMaterial ref={red} color="#ff2a1a" toneMapped={false} />
        </mesh>
        <mesh position={[0.6, 0.2, 0]} raycast={noRaycast}>
          <boxGeometry args={[1.1, 0.28, 0.5]} />
          <meshBasicMaterial ref={blue} color="#3d8bff" toneMapped={false} />
        </mesh>
        <sprite position={[-0.6, 0.3, 0]} scale={4}>
          <spriteMaterial ref={redGlow} map={glowTexture()} color="#ff3b2a" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
        <sprite position={[0.6, 0.3, 0]} scale={4}>
          <spriteMaterial ref={blueGlow} map={glowTexture()} color="#3d8bff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      </group>
    </group>
  );
}

function Officer({ unit }: { unit: Unit }) {
  const g = useRef<THREE.Group>(null);
  const pose = useMemo(newPose, []);
  useFrame((_, delta) => {
    const o = unit.officer;
    const group = g.current;
    if (!group) return;
    group.visible = unit.on && o.active;
    if (!group.visible) return;
    group.position.set(o.x, carOnGround(o.x, o.z, 0).y, o.z);
    group.rotation.y = Math.PI - o.yaw;
    pose.gait = THREE.MathUtils.damp(pose.gait, o.speed > 7 ? 2 : o.speed > 0.5 ? 1 : 0, 10, delta);
    pose.phase = o.phase;
    // Reaching for you while cuffing.
    pose.reach = police.arrest && police.units[police.arrest.unit] === unit && o.speed < 0.5 ? 1 : 0;
  });
  return (
    <group ref={g} visible={false}>
      <Humanoid look={COP_LOOK} pose={pose} />
    </group>
  );
}

// ---- The helicopter -----------------------------------------------------------------------------

/** Buildings the searchlight can hit (boxes: x0, x1, y0, y1, z0, z1). */
const SOLIDS = [
  ...ALL_TIERS.map((t) => ({ x0: t.x - t.w / 2, x1: t.x + t.w / 2, y0: t.y0, y1: t.y1, z0: t.z - t.d / 2, z1: t.z + t.d / 2 })),
  (() => {
    const a = toWorld(BANK, -BANK_PLAN.halfW, 0);
    const b = toWorld(BANK, BANK_PLAN.halfW, -BANK_PLAN.depth);
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: 0, y1: BANK_PLAN.height + 0.8, z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
  })(),
  (() => {
    const a = toWorld(JEWELRY, -JEWELRY_PLAN.halfW, 0);
    const b = toWorld(JEWELRY, JEWELRY_PLAN.halfW, -JEWELRY_PLAN.depth);
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: 0, y1: JEWELRY_PLAN.height + 0.7, z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
  })(),
];

/** How far along the line from a to b (0…1) the first building is, or 1 if nothing's in the way. */
export function firstHit(a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a);
  let best = 1;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minZ = Math.min(a.z, b.z);
  const maxZ = Math.max(a.z, b.z);
  for (const s of SOLIDS) {
    if (s.x1 < minX || s.x0 > maxX || s.z1 < minZ || s.z0 > maxZ) continue;
    let t0 = 0;
    let t1 = best;
    for (const [o, dir, lo, hi] of [
      [a.x, d.x, s.x0, s.x1],
      [a.y, d.y, s.y0, s.y1],
      [a.z, d.z, s.z0, s.z1],
    ] as const) {
      if (Math.abs(dir) < 1e-9) {
        if (o < lo || o > hi) {
          t0 = 2;
          break;
        }
        continue;
      }
      let ta = (lo - o) / dir;
      let tb = (hi - o) / dir;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < best) best = t0;
  }
  return best;
}

const target = new THREE.Vector3();
const hit = new THREE.Vector3();

function Helicopter() {
  const heli = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const light = useRef<THREE.Group>(null);
  const spot = useRef<THREE.Mesh>(null);
  const s = useRef({ since: -1, leftAt: -1, pos: new THREE.Vector3(9999, 300, 9999), cx: 0, cz: 0 });
  const cone = useMemo(() => new THREE.ConeGeometry(1, 1, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.5), []);
  const sign = useMemo(() => signTexture("Police", { bg: "transparent", fg: "#ffffff", height: 64 }), []);

  useFrame((frame, delta) => {
    const h = heli.current;
    if (!h) return;
    const st = s.current;
    const now = game.now;
    const chasing = Boolean(game.wanted) || Boolean(police.arrest);
    const you = drive.active ? { x: drive.pos.x, z: drive.pos.z } : { x: player.x, z: player.z };
    if (chasing && st.since < 0) {
      st.since = now;
      st.leftAt = -1;
      st.cx = you.x;
      st.cz = you.z;
    }
    if (!chasing && st.since >= 0 && st.leftAt < 0) st.leftAt = now;
    if (st.since < 0) {
      h.visible = false;
      if (light.current) light.current.visible = false;
      if (spot.current) spot.current.visible = false;
      return;
    }
    // Circle over you (the circle's middle drifts after you).
    st.cx += (you.x - st.cx) * Math.min(1, delta * 0.6);
    st.cz += (you.z - st.cz) * Math.min(1, delta * 0.6);
    const a = now * 0.32;
    const orbit = new THREE.Vector3(st.cx + Math.cos(a) * 40, 55, st.cz + Math.sin(a) * 40);
    const from = new THREE.Vector3(st.cx + 420, 180, st.cz - 320);
    const enter = Math.min(1, Math.max(0, (now - st.since - 3) / 7));
    const want = from.lerp(orbit, 1 - (1 - enter) ** 3);
    if (st.leftAt >= 0) {
      const k = Math.min(1, (now - st.leftAt) / 7);
      want.lerp(new THREE.Vector3(st.cx - 500, 260, st.cz + 400), k * k);
      if (k >= 1) {
        st.since = -1;
        h.visible = false;
        return;
      }
    }
    h.visible = true;
    const dx = want.x - st.pos.x;
    const dz = want.z - st.pos.z;
    if (Math.hypot(dx, dz) > 0.01 && st.pos.x < 9000) h.rotation.set(0.12, Math.atan2(-dx, -dz), 0, "YXZ");
    st.pos.copy(want);
    h.position.copy(want);
    if (rotor.current) rotor.current.rotation.y += delta * 28;
    if (tail.current) tail.current.rotation.x += delta * 34;

    // The searchlight, stopped by the first rooftop in the way.
    target.set(you.x, carOnGround(you.x, you.z, 0).y + 0.2, you.z);
    const l = light.current;
    const on = enter > 0.6 && st.leftAt < 0;
    if (l) {
      l.visible = on;
      l.position.copy(want).add(new THREE.Vector3(0, -1.6, 0));
      const k = firstHit(l.position, target);
      hit.lerpVectors(l.position, target, k);
      l.lookAt(hit);
      const dist = l.position.distanceTo(hit);
      l.scale.set(dist * 0.09, dist * 0.09, dist);
    }
    const g = spot.current;
    if (g) {
      g.visible = on;
      g.position.set(hit.x, hit.y + 0.15, hit.z);
      g.scale.setScalar(Math.max(1, l ? l.scale.x : 1));
      if (g.material instanceof THREE.MeshBasicMaterial) g.material.opacity = 0.35 + Math.sin(frame.clock.elapsedTime * 8) * 0.05;
    }
  });

  return (
    <group>
      <group ref={heli} visible={false}>
        <mesh scale={[2.2, 2, 3.6]} castShadow raycast={noRaycast}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshStandardMaterial color="#1d3f7a" roughness={0.35} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.5, -2.2]} scale={[1.6, 1.1, 1.6]} raycast={noRaycast}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color="#9fd3f0" roughness={0.05} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.3, 5]} raycast={noRaycast}>
          <boxGeometry args={[0.6, 0.6, 6]} />
          <meshStandardMaterial color="#1d3f7a" roughness={0.35} metalness={0.4} />
        </mesh>
        <mesh position={[0, 1.2, 7.8]} raycast={noRaycast}>
          <boxGeometry args={[0.2, 2, 1.4]} />
          <meshStandardMaterial color="#f4f6f8" roughness={0.4} />
        </mesh>
        <group ref={tail} position={[0.4, 1.2, 7.9]}>
          <mesh raycast={noRaycast}>
            <boxGeometry args={[0.06, 2.6, 0.25]} />
            <meshBasicMaterial color="#2b2f36" />
          </mesh>
        </group>
        <mesh position={[0, 2.3, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.2, 0.2, 0.8, 8]} />
          <meshBasicMaterial color="#2b2f36" />
        </mesh>
        <group ref={rotor} position={[0, 2.7, 0]}>
          {[0, Math.PI / 2].map((r) => (
            <mesh key={r} rotation-y={r} raycast={noRaycast}>
              <boxGeometry args={[15, 0.1, 0.7]} />
              <meshBasicMaterial color="#2b2f36" />
            </mesh>
          ))}
        </group>
        {[-1, 1].map((k) => (
          <mesh key={k} position={[k * 1.6, -2.3, 0]} raycast={noRaycast}>
            <boxGeometry args={[0.2, 0.2, 5]} />
            <meshBasicMaterial color="#2b2f36" />
          </mesh>
        ))}
        {[-1, 1].map((k) => (
          <mesh key={`s${k}`} position={[k * 2.23, 0.1, 0.6]} rotation-y={(k * Math.PI) / 2} raycast={noRaycast}>
            <planeGeometry args={[2.6, 2.6 / sign.aspect]} />
            <meshBasicMaterial map={sign.texture} transparent />
          </mesh>
        ))}
      </group>
      <group ref={light} visible={false}>
        <mesh geometry={cone} raycast={noRaycast}>
          <meshBasicMaterial color="#fff2b0" transparent opacity={0.14} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={spot} rotation-x={-Math.PI / 2} visible={false} raycast={noRaycast}>
        <circleGeometry args={[1, 28]} />
        <meshBasicMaterial color="#fff6c8" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
