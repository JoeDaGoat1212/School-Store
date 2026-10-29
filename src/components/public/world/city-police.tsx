"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { copSpots, player } from "./bump";
import { CarModel, newLook } from "./car-model";
import { COP_ROUTES, SITE_CENTER, type SiteKey } from "./city-layout";
import { drive } from "./drive";
import { COPS_AFTER, game } from "./heist";
import { noRaycast, signTexture, toonRamp } from "./paint";

/*
 * The police, once an alarm goes off: two squad cars race up the road (lights
 * flashing red and blue) and screech to a stop outside, and a helicopter
 * swoops in and circles overhead, its searchlight following you. When the
 * chase is over the cars back off and the helicopter flies away.
 */

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const AWAY = { x: -9999, z: -9999 };

export function Police() {
  return (
    <group>
      {(["bank", "jewelry"] as SiteKey[]).flatMap((site, s) =>
        COP_ROUTES[site].map((route, k) => <CopCar key={`${site}${k}`} site={site} route={route} order={k} spot={s * 2 + k} />),
      )}
      <Helicopter />
    </group>
  );
}

function CopCar({ site, route, order, spot }: { site: SiteKey; route: { x: number; z: number }[]; order: number; spot: number }) {
  const group = useRef<THREE.Group>(null);
  const red = useRef<THREE.MeshBasicMaterial>(null);
  const blue = useRef<THREE.MeshBasicMaterial>(null);
  const redGlow = useRef<THREE.SpriteMaterial>(null);
  const blueGlow = useRef<THREE.SpriteMaterial>(null);
  const look = useMemo(newLook, []);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(route.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, "centripetal"), [route]);
  const length = useMemo(() => curve.getLength(), [curve]);
  const sign = useMemo(() => signTexture("Police", { bg: "#1d4f91", fg: "#ffffff", height: 64 }), []);
  const glow = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  const last = useRef(0);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const s = game.sites[site];
    // How far along the drive in they are (0 = far away, 1 = parked out front).
    let p = 0;
    if (s.alarm) {
      const t = game.now - s.alarmAt - COPS_AFTER - order * 1.6;
      p = t <= 0 ? 0 : 1 - (1 - clamp01(t / 6)) ** 3;
      if (s.copsLeftAt >= 0) p = Math.min(p, 1 - clamp01((game.now - s.copsLeftAt - 2) / 5));
    }
    const shown = p > 0.002;
    g.visible = shown;
    if (!shown) {
      Object.assign(copSpots[spot], AWAY);
      last.current = 0;
      return;
    }
    const at = curve.getPointAt(p);
    const tan = curve.getTangentAt(p);
    const heading = Math.atan2(-tan.x, -tan.z);
    g.position.set(at.x, 0, at.z);
    g.rotation.y = heading;
    Object.assign(copSpots[spot], { x: at.x, z: at.z, heading });
    const moved = (p - last.current) * length;
    last.current = p;
    look.spin += moved / 0.75;
    look.braking = p > 0.85 && p < 1;
    look.pitch = p > 0.9 && p < 0.995 ? -0.04 : 0;
    // Red, blue, red, blue.
    const flip = Math.floor(state.clock.elapsedTime * 6) % 2 === 0;
    red.current?.color.set(flip ? "#ff2a1a" : "#5a1410");
    blue.current?.color.set(flip ? "#123a8a" : "#3d8bff");
    if (redGlow.current) redGlow.current.opacity = flip ? 0.9 : 0;
    if (blueGlow.current) blueGlow.current.opacity = flip ? 0 : 0.9;
  });

  return (
    <group ref={group} visible={false}>
      <CarModel color="#f4f6f8" look={look} />
      {/* Light bar */}
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
          <spriteMaterial ref={redGlow} map={glow} color="#ff3b2a" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
        <sprite position={[0.6, 0.3, 0]} scale={4}>
          <spriteMaterial ref={blueGlow} map={glow} color="#3d8bff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      </group>
      {/* POLICE down both sides */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.73, 1.3, 0]} rotation-y={(side * Math.PI) / 2} raycast={noRaycast}>
          <planeGeometry args={[3.4, 3.4 / sign.aspect]} />
          <meshBasicMaterial map={sign.texture} transparent />
        </mesh>
      ))}
    </group>
  );
}

const beam = new THREE.Vector3();

function Helicopter() {
  const heli = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const light = useRef<THREE.Group>(null);
  const spotOnGround = useRef<THREE.Mesh>(null);
  const state = useRef({ site: "bank" as SiteKey, since: -1, leftAt: -1, pos: new THREE.Vector3(9999, 300, 9999) });
  const cone = useMemo(() => new THREE.ConeGeometry(1, 1, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.5), []);
  const sign = useMemo(() => signTexture("Police", { bg: "transparent", fg: "#ffffff", height: 64 }), []);

  useFrame((frame, delta) => {
    const h = heli.current;
    if (!h) return;
    const s = state.current;
    const w = game.wanted;
    const now = game.now;
    if (w && s.since < 0) {
      s.since = now;
      s.site = w.site;
      s.leftAt = -1;
    }
    if (!w && s.since >= 0 && s.leftAt < 0) s.leftAt = now;
    if (s.since < 0) {
      h.visible = false;
      return;
    }
    const c = SITE_CENTER[s.site];
    const a = now * 0.32;
    const orbit = new THREE.Vector3(c.x + Math.cos(a) * 44, 48, c.z + Math.sin(a) * 44);
    const from = new THREE.Vector3(c.x + 420, 170, c.z - 320);
    const enter = clamp01((now - s.since - 2) / 7);
    const want = from.clone().lerp(orbit, 1 - (1 - enter) ** 3);
    if (s.leftAt >= 0) {
      const k = clamp01((now - s.leftAt) / 7);
      want.lerp(new THREE.Vector3(c.x - 500, 260, c.z + 400), k * k);
      if (k >= 1) {
        s.since = -1;
        h.visible = false;
        return;
      }
    }
    h.visible = true;
    // Face the way it's moving, nose dipped a little.
    const dx = want.x - s.pos.x;
    const dz = want.z - s.pos.z;
    if (Math.hypot(dx, dz) > 0.01 && s.pos.x < 9000) h.rotation.set(0.12, Math.atan2(-dx, -dz), 0, "YXZ");
    s.pos.copy(want);
    h.position.copy(want);
    if (rotor.current) rotor.current.rotation.y += delta * 28;
    if (tail.current) tail.current.rotation.x += delta * 34;

    // The searchlight: on you if you're close, else on the building.
    const you = drive.active ? { x: drive.pos.x, z: drive.pos.z } : { x: player.x, z: player.z };
    const target = Math.hypot(you.x - c.x, you.z - c.z) < 180 ? you : c;
    beam.set(target.x, 0.2, target.z);
    const l = light.current;
    if (l) {
      l.visible = enter > 0.6 && s.leftAt < 0;
      l.position.copy(want).add(new THREE.Vector3(0, -1.6, 0));
      l.lookAt(beam);
      const dist = l.position.distanceTo(beam);
      l.scale.set(dist * 0.09, dist * 0.09, dist);
    }
    const g = spotOnGround.current;
    if (g) {
      g.visible = Boolean(l?.visible);
      g.position.set(target.x, 0.3, target.z);
      if (g.material instanceof THREE.MeshBasicMaterial) g.material.opacity = 0.35 + Math.sin(frame.clock.elapsedTime * 8) * 0.05;
    }
  });

  return (
    <group>
      <group ref={heli} visible={false}>
        <mesh scale={[2.2, 2, 3.6]} castShadow raycast={noRaycast}>
          <sphereGeometry args={[1, 20, 14]} />
          <meshToonMaterial color="#1d4f91" gradientMap={toonRamp()} />
        </mesh>
        <mesh position={[0, 0.5, -2.2]} scale={[1.6, 1.1, 1.6]} raycast={noRaycast}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color="#9fd3f0" roughness={0.1} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.3, 5]} raycast={noRaycast}>
          <boxGeometry args={[0.6, 0.6, 6]} />
          <meshToonMaterial color="#1d4f91" gradientMap={toonRamp()} />
        </mesh>
        <mesh position={[0, 1.2, 7.8]} raycast={noRaycast}>
          <boxGeometry args={[0.2, 2, 1.4]} />
          <meshToonMaterial color="#f4f6f8" gradientMap={toonRamp()} />
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
          <meshBasicMaterial color="#fff2b0" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={spotOnGround} rotation-x={-Math.PI / 2} visible={false} raycast={noRaycast}>
        <circleGeometry args={[4.5, 28]} />
        <meshBasicMaterial color="#fff6c8" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
