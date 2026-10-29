"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { canvasTexture, noRaycast } from "./paint";
import type { Body } from "./vehicles";

/*
 * A realistic car: its body is a side profile (bumpers, hood, roof line,
 * trunk, wheel arches) extruded across with rounded edges, under glossy
 * clear-coated paint, with a tinted glasshouse, door lines, mirrors, a
 * grille, headlights and tail lights, number plates, and wheels with tyres,
 * spoked rims and brake discs. Body styles: sedan, hatchback, SUV, pickup,
 * sports coupe and supercar. Motorbikes are MotorbikeModel.
 *
 * Whatever drives it (you, the traffic, the police) fills in a CarLook each
 * frame; the car reads it and moves its wheels, lights and body to match.
 * The front points toward -z. Every car is about 7 long and 3.4 wide (so
 * they all bump into things the same way).
 */

export type CarLook = {
  /** How far the wheels have rolled (radians). */
  spin: number;
  /** Front wheels' steering angle (radians, + = left). */
  steer: number;
  braking: boolean;
  reversing: boolean;
  /** Nose down (+) when braking, up when speeding up; lean in turns. */
  pitch: number;
  roll: number;
};

export const newLook = (): CarLook => ({ spin: 0, steer: 0, braking: false, reversing: false, pitch: 0, roll: 0 });

const BRAKE_OFF = new THREE.Color("#5a120e");
const BRAKE_ON = new THREE.Color("#ff4a35").multiplyScalar(1.6);
const REVERSE_OFF = new THREE.Color("#7a7a7a");
const REVERSE_ON = new THREE.Color("#ffffff").multiplyScalar(1.4);

/** One body style's shape: the side profile of the lower body and of the glasshouse (s = along the car, front -3.5 … back 3.5; h = height). */
type Style = {
  body: [number, number][];
  glass: [number, number][];
  /** Where the wheels are (along) and how big. */
  wheels: number[];
  wheelR: number;
  width: number;
  /** The top of the roof (for the roof panel), and where it starts/ends along the car. */
  roof: [number, number, number];
  /** Headlight and tail light height. */
  lights: number;
  spoiler?: boolean;
  bed?: boolean;
};

const STYLES: Record<Exclude<Body, "moto" | "plane" | "heli">, Style> = {
  sedan: {
    body: [
      [-3.5, 0.62],
      [-3.56, 0.95],
      [-3.42, 1.28],
      [-3.0, 1.42],
      [-1.15, 1.6],
      [2.25, 1.62],
      [3.2, 1.55],
      [3.52, 1.3],
      [3.56, 0.85],
      [3.45, 0.55],
    ],
    glass: [
      [-1.22, 1.58],
      [-0.2, 2.5],
      [1.35, 2.5],
      [2.3, 1.62],
    ],
    wheels: [-2.2, 2.25],
    wheelR: 0.6,
    width: 3.3,
    roof: [-0.15, 1.3, 2.52],
    lights: 1.25,
  },
  hatch: {
    body: [
      [-3.3, 0.62],
      [-3.36, 0.95],
      [-3.24, 1.3],
      [-2.8, 1.45],
      [-1.0, 1.62],
      [2.9, 1.66],
      [3.3, 1.5],
      [3.36, 0.85],
      [3.25, 0.55],
    ],
    glass: [
      [-1.08, 1.6],
      [-0.05, 2.55],
      [2.55, 2.5],
      [3.05, 1.66],
    ],
    wheels: [-2.1, 2.2],
    wheelR: 0.58,
    width: 3.2,
    roof: [0.0, 2.55, 2.56],
    lights: 1.3,
  },
  suv: {
    body: [
      [-3.52, 0.8],
      [-3.6, 1.2],
      [-3.45, 1.7],
      [-3.0, 1.88],
      [-1.25, 2.05],
      [3.3, 2.1],
      [3.52, 1.9],
      [3.58, 1.0],
      [3.45, 0.72],
    ],
    glass: [
      [-1.32, 2.02],
      [-0.4, 3.0],
      [3.05, 3.0],
      [3.35, 2.1],
    ],
    wheels: [-2.25, 2.3],
    wheelR: 0.7,
    width: 3.45,
    roof: [-0.45, 3.1, 3.02],
    lights: 1.65,
  },
  pickup: {
    body: [
      [-3.55, 0.8],
      [-3.62, 1.2],
      [-3.48, 1.75],
      [-3.0, 1.92],
      [-1.0, 2.05],
      [3.5, 2.05],
      [3.58, 1.0],
      [3.45, 0.72],
    ],
    glass: [
      [-1.08, 2.02],
      [-0.25, 2.95],
      [0.95, 2.95],
      [1.15, 2.05],
    ],
    wheels: [-2.3, 2.3],
    wheelR: 0.72,
    width: 3.45,
    roof: [-0.3, 1.2, 2.97],
    lights: 1.7,
    bed: true,
  },
  sports: {
    body: [
      [-3.55, 0.48],
      [-3.62, 0.78],
      [-3.4, 1.0],
      [-2.8, 1.1],
      [-0.9, 1.3],
      [2.6, 1.38],
      [3.45, 1.3],
      [3.6, 1.0],
      [3.55, 0.6],
      [3.42, 0.42],
    ],
    glass: [
      [-1.0, 1.28],
      [0.15, 2.05],
      [1.0, 2.05],
      [2.85, 1.38],
    ],
    wheels: [-2.25, 2.25],
    wheelR: 0.62,
    width: 3.45,
    roof: [0.1, 1.05, 2.07],
    lights: 1.0,
    spoiler: true,
  },
  super: {
    body: [
      [-3.62, 0.4],
      [-3.7, 0.62],
      [-3.4, 0.82],
      [-1.6, 1.1],
      [-0.6, 1.25],
      [2.9, 1.32],
      [3.55, 1.22],
      [3.66, 0.8],
      [3.55, 0.38],
    ],
    glass: [
      [-1.7, 1.08],
      [-0.4, 1.86],
      [0.6, 1.86],
      [2.5, 1.32],
    ],
    wheels: [-2.25, 2.3],
    wheelR: 0.64,
    width: 3.6,
    roof: [-0.35, 0.95, 1.88],
    lights: 0.85,
    spoiler: true,
  },
};

/** Extrude a side profile across the car's width (rounded edges), front toward -z. */
function profileGeometry(points: [number, number][], width: number, bevel: number, arches?: { wheels: number[]; r: number; cy: number }) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const [s, h] of points.slice(1)) shape.lineTo(s, h);
  if (arches) {
    // Along the bottom, back to front, with a round notch over each wheel.
    const last = points[points.length - 1];
    const [rear, front] = [...arches.wheels].sort((a, b) => b - a);
    const r = arches.r;
    const cy = arches.cy;
    const base = Math.min(last[1], points[0][1]);
    // Straight up from the sill, round over the wheel, and back down.
    for (const w of [rear, front]) {
      shape.lineTo(w + r, base);
      shape.lineTo(w + r, cy);
      shape.absarc(w, cy, r, 0, Math.PI, false);
      shape.lineTo(w - r, base);
    }
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

const geoCache = new Map<string, { body: THREE.BufferGeometry; glass: THREE.BufferGeometry }>();
function bodyGeometry(kind: keyof typeof STYLES) {
  let g = geoCache.get(kind);
  if (!g) {
    const st = STYLES[kind];
    g = {
      body: profileGeometry(st.body, st.width, 0.18, { wheels: st.wheels, r: st.wheelR + 0.12, cy: st.wheelR }),
      glass: profileGeometry(st.glass, st.width - 0.42, 0.14),
    };
    geoCache.set(kind, g);
  }
  return g;
}

// Shared materials (the paint is made per colour).
const paintCache = new Map<string, THREE.MeshPhysicalMaterial>();
function paint(color: string) {
  let m = paintCache.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08 });
    paintCache.set(color, m);
  }
  return m;
}
const M = {
  glass: new THREE.MeshPhysicalMaterial({ color: "#1d2733", roughness: 0.05, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }),
  tyre: new THREE.MeshStandardMaterial({ color: "#16181b", roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: "#c9ced4", roughness: 0.25, metalness: 0.9 }),
  disc: new THREE.MeshStandardMaterial({ color: "#5c6168", roughness: 0.4, metalness: 0.8 }),
  trim: new THREE.MeshStandardMaterial({ color: "#14161a", roughness: 0.45, metalness: 0.2 }),
  chrome: new THREE.MeshStandardMaterial({ color: "#e8ecf0", roughness: 0.12, metalness: 1 }),
  head: new THREE.MeshBasicMaterial({ color: "#fff6dc", toneMapped: false }),
  plate: new THREE.MeshStandardMaterial({ color: "#f2f2ec", roughness: 0.5 }),
};
const WHEEL_GEO = {
  tyre: new THREE.CylinderGeometry(1, 1, 1, 26).rotateZ(Math.PI / 2),
  rim: new THREE.CylinderGeometry(1, 1, 1, 20).rotateZ(Math.PI / 2),
  spoke: new THREE.BoxGeometry(0.04, 1, 0.12),
  box: new THREE.BoxGeometry(1, 1, 1),
};

/** A soft red blur (made once, shared by every car) for the glow behind the brake lights. */
let glow: THREE.Texture | null = null;
function glowTexture() {
  if (glow) return glow;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  for (const x of [34, 94]) {
    const grad = g.createRadialGradient(x, 32, 2, x, 32, 34);
    grad.addColorStop(0, "rgba(255,70,40,0.9)");
    grad.addColorStop(1, "rgba(255,70,40,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 64);
  }
  glow = canvasTexture(c);
  return glow;
}

function Wheel({ x, z, r, spinRef, steerRef, width = 0.6 }: { x: number; z: number; r: number; spinRef: (g: THREE.Group | null) => void; steerRef: (g: THREE.Group | null) => void; width?: number }) {
  const side = x > 0 ? 1 : -1;
  return (
    <group position={[x, r, z]} ref={steerRef}>
      <group ref={spinRef}>
        <mesh geometry={WHEEL_GEO.tyre} material={M.tyre} scale={[width, r, r]} castShadow raycast={noRaycast} />
        <mesh geometry={WHEEL_GEO.rim} material={M.rim} position-x={side * (width / 2 + 0.005)} scale={[0.04, r * 0.66, r * 0.66]} raycast={noRaycast} />
        {/* Spokes */}
        {[0, 1, 2, 3, 4].map((k) => (
          <mesh key={k} geometry={WHEEL_GEO.spoke} material={M.rim} position-x={side * (width / 2 + 0.03)} rotation-x={(k / 5) * Math.PI * 2} scale={[1, r * 1.2, 1]} raycast={noRaycast} />
        ))}
      </group>
      {/* Brake disc (doesn't spin with the wheel's spokes: you see it through them) */}
      <mesh geometry={WHEEL_GEO.rim} material={M.disc} position-x={side * (width / 2 - 0.12)} scale={[0.05, r * 0.5, r * 0.5]} raycast={noRaycast} />
    </group>
  );
}

/** Cars closer than this are drawn in full detail. */
const CAR_NEAR = 55;
const CAR_AT = new THREE.Vector3();
const FAR_TYRE = new THREE.CylinderGeometry(1, 1, 1, 12);

export function CarModel({ color, look, body = "sedan" }: { color: string; look: CarLook; body?: Body }) {
  if (body === "moto") return <MotorbikeModel color={color} look={look} />;
  const kind = (body in STYLES ? body : "sedan") as keyof typeof STYLES;
  return <Car color={color} look={look} kind={kind} />;
}

function Car({ color, look, kind }: { color: string; look: CarLook; kind: keyof typeof STYLES }) {
  const st = STYLES[kind];
  const geo = useMemo(() => bodyGeometry(kind), [kind]);
  const bodyRef = useRef<THREE.Group>(null);
  const steers = useRef<(THREE.Group | null)[]>([]);
  const spins = useRef<(THREE.Group | null)[]>([]);
  const halo = useRef<THREE.Mesh>(null);
  const detail = useRef<THREE.Group>(null);
  const nearWheels = useRef<THREE.Group>(null);
  const farWheels = useRef<THREE.Group>(null);
  // This car's own light materials (so one car braking doesn't light up every car).
  const brake = useMemo(() => new THREE.MeshBasicMaterial({ color: BRAKE_OFF, toneMapped: false }), []);
  const reverse = useMemo(() => new THREE.MeshBasicMaterial({ color: REVERSE_OFF, toneMapped: false }), []);
  const p = paint(color);
  const W = st.width / 2;
  const front = st.body[0][0];
  const back = st.body[st.body.length - 1][0];
  const L = st.lights;

  useFrame(({ camera }, delta) => {
    // Level of detail: far off, only the body, the glass and the tyres are drawn (6 parts instead of 60).
    if (bodyRef.current) {
      bodyRef.current.getWorldPosition(CAR_AT);
      const near = CAR_AT.distanceToSquared(camera.position) < CAR_NEAR * CAR_NEAR;
      if (detail.current) detail.current.visible = near;
      if (nearWheels.current) nearWheels.current.visible = near;
      if (farWheels.current) farWheels.current.visible = !near;
      if (!near) return;
    }
    steers.current.forEach((w, i) => {
      if (w) w.rotation.y = i < 2 ? look.steer : 0;
    });
    spins.current.forEach((s) => {
      if (s) s.rotation.x = -look.spin;
    });
    brake.color.lerp(look.braking ? BRAKE_ON : BRAKE_OFF, 1 - Math.exp(-20 * delta));
    reverse.color.copy(look.reversing ? REVERSE_ON : REVERSE_OFF);
    if (halo.current) halo.current.visible = look.braking;
    if (bodyRef.current) {
      bodyRef.current.rotation.x = THREE.MathUtils.damp(bodyRef.current.rotation.x, -look.pitch, 8, delta);
      bodyRef.current.rotation.z = THREE.MathUtils.damp(bodyRef.current.rotation.z, look.roll, 8, delta);
    }
  });

  const wheelX = W - 0.36;
  return (
    <group>
      <group ref={bodyRef} position-y={0.9}>
        <group position-y={-0.9}>
          <mesh geometry={geo.body} material={p} castShadow receiveShadow raycast={noRaycast} />
          <mesh geometry={geo.glass} material={M.glass} castShadow raycast={noRaycast} />
          <group ref={detail}>
          {/* Roof panel in the body colour, and the pillars between the windows */}
          <mesh geometry={WHEEL_GEO.box} material={p} position={[0, st.roof[2] - 0.02, (st.roof[0] + st.roof[1]) / 2]} scale={[st.width - 0.55, 0.08, st.roof[1] - st.roof[0]]} raycast={noRaycast} />
          {[-1, 1].map((s) => (
            <mesh key={`pillar${s}`} geometry={WHEEL_GEO.box} material={p} position={[s * (W - 0.215), (st.glass[0][1] + st.roof[2]) / 2, (st.glass[1][0] + st.glass[2][0]) / 2]} scale={[0.06, st.roof[2] - st.glass[0][1], 0.16]} raycast={noRaycast} />
          ))}
          {/* Black sills and bumper strips */}
          {[-1, 1].map((s) => (
            <mesh key={`sill${s}`} geometry={WHEEL_GEO.box} material={M.trim} position={[s * (W - 0.02), 0.62, (st.wheels[0] + st.wheels[1]) / 2]} scale={[0.06, 0.16, st.wheels[1] - st.wheels[0] - st.wheelR * 2.2]} raycast={noRaycast} />
          ))}
          {/* Door lines and handles */}
          {[-1, 1].map((s) => (
            <group key={`door${s}`}>
              <mesh geometry={WHEEL_GEO.box} material={M.trim} position={[s * (W + 0.005), (L + st.glass[0][1]) / 2 - 0.1, (st.glass[1][0] + st.glass[2][0]) / 2]} scale={[0.012, st.glass[0][1] - 0.7, 0.03]} raycast={noRaycast} />
              <mesh geometry={WHEEL_GEO.box} material={M.chrome} position={[s * (W + 0.01), st.glass[0][1] - 0.18, st.glass[1][0] + 0.25]} scale={[0.03, 0.06, 0.32]} raycast={noRaycast} />
              {/* Mirror */}
              <mesh geometry={WHEEL_GEO.box} material={p} position={[s * (W + 0.18), st.glass[0][1] + 0.12, st.glass[0][0] + 0.35]} scale={[0.3, 0.2, 0.36]} raycast={noRaycast} />
            </group>
          ))}
          {/* Front: grille, headlights, number plate */}
          <mesh geometry={WHEEL_GEO.box} material={M.trim} position={[0, L - 0.25, front - 0.02]} scale={[st.width * 0.42, 0.34, 0.06]} raycast={noRaycast} />
          {[-1, 1].map((s) => (
            <mesh key={`hl${s}`} geometry={WHEEL_GEO.box} material={M.head} position={[s * (W - 0.55), L, front + 0.04]} scale={[0.62, 0.17, 0.05]} raycast={noRaycast} />
          ))}
          <mesh geometry={WHEEL_GEO.box} material={M.plate} position={[0, L - 0.58, front - 0.04]} scale={[0.75, 0.24, 0.03]} raycast={noRaycast} />
          {/* Back: tail lights (brake + reverse), number plate, exhausts */}
          <mesh geometry={WHEEL_GEO.box} material={M.trim} position={[0, L + 0.02, back + 0.005]} scale={[st.width - 0.4, 0.28, 0.04]} raycast={noRaycast} />
          {[-1, 1].map((s) => (
            <group key={`tl${s}`}>
              <mesh geometry={WHEEL_GEO.box} material={brake} position={[s * (W - 0.55), L + 0.02, back + 0.03]} scale={[0.75, 0.22, 0.04]} raycast={noRaycast} />
              <mesh geometry={WHEEL_GEO.box} material={reverse} position={[s * (W - 1.08), L + 0.02, back + 0.03]} scale={[0.22, 0.16, 0.04]} raycast={noRaycast} />
              <mesh geometry={WHEEL_GEO.rim} material={M.chrome} position={[s * 0.8, 0.5, back - 0.05]} rotation-y={Math.PI / 2} scale={[0.3, 0.08, 0.08]} raycast={noRaycast} />
            </group>
          ))}
          <mesh geometry={WHEEL_GEO.box} material={M.plate} position={[0, L - 0.42, back + 0.03]} scale={[0.75, 0.24, 0.03]} raycast={noRaycast} />
          {/* The glow behind the brake lights */}
          <mesh ref={halo} position={[0, L, back + 0.12]} visible={false} raycast={noRaycast}>
            <planeGeometry args={[st.width + 1, 1.6]} />
            <meshBasicMaterial map={glowTexture()} transparent opacity={0.7} toneMapped={false} depthWrite={false} />
          </mesh>
          {st.spoiler && (
            <group position={[0, st.body[st.body.length - 4][1] + 0.35, back - 0.45]}>
              <mesh geometry={WHEEL_GEO.box} material={kind === "super" ? M.trim : p} scale={[st.width - 0.5, 0.06, 0.5]} raycast={noRaycast} />
              {[-1, 1].map((s) => (
                <mesh key={s} geometry={WHEEL_GEO.box} material={M.trim} position={[s * (W - 0.6), -0.2, 0]} scale={[0.06, 0.4, 0.2]} raycast={noRaycast} />
              ))}
            </group>
          )}
          {st.bed && (
            <group>
              {/* The pickup's open bed: a dark floor with the body's sides round it */}
              <mesh geometry={WHEEL_GEO.box} material={M.trim} position={[0, 2.06, 2.35]} scale={[st.width - 0.5, 0.04, 2.2]} raycast={noRaycast} />
            </group>
          )}
          </group>
        </group>
      </group>

      {/* Far away: just the tyres. */}
      <group ref={farWheels} visible={false}>
        {[
          [-wheelX, st.wheels[0]],
          [wheelX, st.wheels[0]],
          [-wheelX, st.wheels[1]],
          [wheelX, st.wheels[1]],
        ].map(([x, z], i) => (
          <mesh key={i} geometry={FAR_TYRE} material={M.tyre} position={[x, st.wheelR, z]} rotation-z={Math.PI / 2} scale={[st.wheelR, 0.5, st.wheelR]} raycast={noRaycast} />
        ))}
      </group>
      {/* Wheels: an outer part that steers, an inner part that rolls */}
      <group ref={nearWheels}>
      {[
        [-wheelX, st.wheels[0]],
        [wheelX, st.wheels[0]],
        [-wheelX, st.wheels[1]],
        [wheelX, st.wheels[1]],
      ].map(([x, z], i) => (
        <Wheel
          key={i}
          x={x}
          z={z}
          r={st.wheelR}
          steerRef={(g) => {
            steers.current[i] = g;
          }}
          spinRef={(g) => {
            spins.current[i] = g;
          }}
        />
      ))}
      </group>
    </group>
  );
}

/**
 * A motorbike: two wheels, a frame, fuel tank, seat, handlebars, a headlight
 * and an exhaust. It leans into turns (look.roll). The rider is drawn by
 * whoever's riding it.
 */
export function MotorbikeModel({ color, look }: { color: string; look: CarLook }) {
  const lean = useRef<THREE.Group>(null);
  const bars = useRef<THREE.Group>(null);
  const spins = useRef<(THREE.Group | null)[]>([]);
  const brake = useMemo(() => new THREE.MeshBasicMaterial({ color: BRAKE_OFF, toneMapped: false }), []);
  const p = paint(color);
  useFrame((_, delta) => {
    spins.current.forEach((s) => {
      if (s) s.rotation.x = -look.spin * 1.15;
    });
    if (bars.current) bars.current.rotation.y = look.steer;
    if (lean.current) lean.current.rotation.z = THREE.MathUtils.damp(lean.current.rotation.z, look.roll * 4, 6, delta);
    brake.color.lerp(look.braking ? BRAKE_ON : BRAKE_OFF, 1 - Math.exp(-20 * delta));
  });
  const r = 0.66;
  return (
    <group ref={lean}>
      {[-1.45, 1.4].map((z, i) => (
        <group key={i} position={[0, r, z]}>
          <group
            ref={(g) => {
              spins.current[i] = g;
            }}
          >
            <mesh geometry={WHEEL_GEO.tyre} material={M.tyre} scale={[0.32, r, r]} castShadow raycast={noRaycast} />
            <mesh geometry={WHEEL_GEO.rim} material={M.rim} scale={[0.34, r * 0.6, r * 0.6]} raycast={noRaycast} />
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <mesh key={k} geometry={WHEEL_GEO.spoke} material={M.trim} rotation-x={(k / 6) * Math.PI * 2} scale={[4, r * 1.15, 0.5]} raycast={noRaycast} />
            ))}
          </group>
          <mesh geometry={WHEEL_GEO.rim} material={M.disc} scale={[0.36, r * 0.42, r * 0.42]} raycast={noRaycast} />
        </group>
      ))}
      {/* Frame, engine, tank, seat, tail */}
      <mesh geometry={WHEEL_GEO.box} material={M.trim} position={[0, 0.95, 0]} rotation-x={0.1} scale={[0.3, 0.25, 2.3]} raycast={noRaycast} />
      <mesh geometry={WHEEL_GEO.box} material={M.disc} position={[0, 0.85, 0.1]} scale={[0.55, 0.6, 0.8]} castShadow raycast={noRaycast} />
      <mesh position={[0, 1.42, -0.35]} scale={[0.5, 0.36, 0.9]} material={p} castShadow raycast={noRaycast}>
        <sphereGeometry args={[1, 18, 12]} />
      </mesh>
      <mesh geometry={WHEEL_GEO.box} material={M.trim} position={[0, 1.42, 0.55]} rotation-x={-0.08} scale={[0.42, 0.14, 1.0]} raycast={noRaycast} />
      <mesh geometry={WHEEL_GEO.box} material={p} position={[0, 1.38, 1.2]} rotation-x={-0.25} scale={[0.36, 0.2, 0.7]} castShadow raycast={noRaycast} />
      <mesh geometry={WHEEL_GEO.box} material={brake} position={[0, 1.42, 1.56]} scale={[0.22, 0.08, 0.04]} raycast={noRaycast} />
      {/* Exhaust */}
      <mesh geometry={WHEEL_GEO.rim} material={M.chrome} position={[0.3, 0.75, 0.9]} rotation-y={Math.PI / 2} rotation-z={0.15} scale={[1.1, 0.09, 0.09]} raycast={noRaycast} />
      {/* Front fork, handlebars and headlight (they steer) */}
      <group ref={bars} position={[0, 0, -1.2]}>
        {[-0.14, 0.14].map((x) => (
          <mesh key={x} geometry={WHEEL_GEO.box} material={M.chrome} position={[x, 1.15, -0.1]} rotation-x={0.35} scale={[0.06, 1.2, 0.06]} raycast={noRaycast} />
        ))}
        <mesh geometry={WHEEL_GEO.box} material={M.trim} position={[0, 1.78, 0.08]} scale={[1.1, 0.06, 0.06]} raycast={noRaycast} />
        <mesh position={[0, 1.45, -0.3]} scale={[0.22, 0.2, 0.12]} material={M.head} raycast={noRaycast}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
        <mesh geometry={WHEEL_GEO.box} material={p} position={[0, 1.65, -0.18]} rotation-x={-0.5} scale={[0.4, 0.3, 0.05]} raycast={noRaycast} />
      </group>
    </group>
  );
}
