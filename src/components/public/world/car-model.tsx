"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { canvasTexture, noRaycast, toonRamp } from "./paint";

/*
 * A cartoon car whose wheels turn and spin and whose lights work. Whatever
 * drives it (you, or the traffic) fills in a CarLook each frame; the car
 * reads it and moves its wheels, lights and body to match.
 *
 * The car's front points toward -z. It's 7 long, 3.4 wide.
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

const WHEELS: [number, number][] = [
  [-1.55, -2.25], // front left
  [1.55, -2.25], // front right
  [-1.55, 2.25],
  [1.55, 2.25],
];

const BRAKE_OFF = new THREE.Color("#7a1a14");
// Lit: a hot, light red that stands out even on a red car.
const BRAKE_ON = new THREE.Color("#ff6a55").multiplyScalar(1.5);
const REVERSE_OFF = new THREE.Color("#8a8a8a");
const REVERSE_ON = new THREE.Color("#ffffff").multiplyScalar(1.4);

/** A soft red blur (made once, shared by every car) for the glow behind the brake lights. */
let glow: THREE.Texture | null = null;
function glowTexture() {
  if (glow) return glow;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  // Two soft round blobs, one behind each brake light.
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

export function CarModel({ color, look }: { color: string; look: CarLook }) {
  const body = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Group | null)[]>([]);
  const spins = useRef<(THREE.Group | null)[]>([]);
  const halo = useRef<THREE.Mesh>(null);
  // This car's own light materials (so one car braking doesn't light up every car).
  const brake = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const reverse = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  useFrame((_, delta) => {
    wheels.current.forEach((w, i) => {
      if (w) w.rotation.y = i < 2 ? look.steer : 0;
    });
    spins.current.forEach((s) => {
      if (s) s.rotation.x = -look.spin;
    });
    for (const m of brake.current) m?.color.lerp(look.braking ? BRAKE_ON : BRAKE_OFF, 1 - Math.exp(-20 * delta));
    for (const m of reverse.current) m?.color.copy(look.reversing ? REVERSE_ON : REVERSE_OFF);
    if (halo.current) halo.current.visible = look.braking;
    if (body.current) {
      body.current.rotation.x = THREE.MathUtils.damp(body.current.rotation.x, -look.pitch, 8, delta);
      body.current.rotation.z = THREE.MathUtils.damp(body.current.rotation.z, look.roll, 8, delta);
    }
  });

  const paint = <meshToonMaterial color={color} gradientMap={toonRamp()} />;
  return (
    <group>
      {/* Everything but the wheels leans and dips */}
      <group ref={body} position-y={0.9}>
        <group position-y={-0.9}>
          <RoundedBox args={[3.4, 1.4, 7]} radius={0.45} smoothness={3} position-y={1.25} castShadow raycast={noRaycast}>
            {paint}
          </RoundedBox>
          <RoundedBox args={[3.0, 1.35, 3.8]} radius={0.45} smoothness={3} position={[0, 2.35, 0.4]} castShadow raycast={noRaycast}>
            {paint}
          </RoundedBox>
          {/* Dark glass round the cabin */}
          <RoundedBox args={[3.06, 0.8, 3.5]} radius={0.3} smoothness={2} position={[0, 2.4, 0.4]} raycast={noRaycast}>
            <meshStandardMaterial color="#27384a" roughness={0.15} metalness={0.4} />
          </RoundedBox>
          {/* Headlights (front, -z) */}
          {[-1, 1].map((s) => (
            <mesh key={`h${s}`} position={[s * 1.1, 1.35, -3.52]} raycast={noRaycast}>
              <boxGeometry args={[0.6, 0.3, 0.05]} />
              <meshBasicMaterial color="#fff6d6" toneMapped={false} />
            </mesh>
          ))}
          {/* A dark strip across the back that the lights sit in (so they show up on any colour of car) */}
          <mesh position={[0, 1.35, 3.505]} raycast={noRaycast}>
            <boxGeometry args={[3.05, 0.5, 0.04]} />
            <meshStandardMaterial color="#1b1d21" roughness={0.4} />
          </mesh>
          {/* Brake lights and reverse lights (back, +z) */}
          {[-1, 1].map((s, k) => (
            <group key={`t${s}`}>
              <mesh position={[s * 1.1, 1.35, 3.52]} raycast={noRaycast}>
                <boxGeometry args={[0.7, 0.32, 0.05]} />
                <meshBasicMaterial
                  ref={(m) => {
                    brake.current[k] = m;
                  }}
                  color={BRAKE_OFF}
                  toneMapped={false}
                />
              </mesh>
              <mesh position={[s * 0.45, 1.35, 3.52]} raycast={noRaycast}>
                <boxGeometry args={[0.28, 0.2, 0.05]} />
                <meshBasicMaterial
                  ref={(m) => {
                    reverse.current[k] = m;
                  }}
                  color={REVERSE_OFF}
                  toneMapped={false}
                />
              </mesh>
            </group>
          ))}
          {/* The third brake light, up at the top of the back window */}
          <mesh position={[0, 2.88, 2.33]} raycast={noRaycast}>
            <boxGeometry args={[0.9, 0.12, 0.04]} />
            <meshBasicMaterial
              ref={(m) => {
                brake.current[2] = m;
              }}
              color={BRAKE_OFF}
              toneMapped={false}
            />
          </mesh>
          {/* A soft red glow behind the car while braking */}
          <mesh ref={halo} position={[0, 1.35, 3.62]} visible={false} raycast={noRaycast}>
            <planeGeometry args={[4.4, 1.8]} />
            <meshBasicMaterial map={glowTexture()} transparent opacity={0.75} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      </group>

      {/* Wheels: an outer part that steers, an inner part that rolls */}
      {WHEELS.map(([x, z], i) => (
        <group
          key={i}
          position={[x, 0.75, z]}
          ref={(g) => {
            wheels.current[i] = g;
          }}
        >
          <group
            ref={(g) => {
              spins.current[i] = g;
            }}
          >
            <group rotation-z={Math.PI / 2}>
              <mesh castShadow raycast={noRaycast}>
                <cylinderGeometry args={[0.75, 0.75, 0.55, 18]} />
                <meshToonMaterial color="#222428" gradientMap={toonRamp()} />
              </mesh>
              {/* Hubcap with a stripe, so you can see it roll */}
              <mesh position-y={x > 0 ? 0.29 : -0.29} raycast={noRaycast}>
                <cylinderGeometry args={[0.38, 0.38, 0.04, 14]} />
                <meshToonMaterial color="#d9dde1" gradientMap={toonRamp()} />
              </mesh>
              <mesh position-y={x > 0 ? 0.31 : -0.31} raycast={noRaycast}>
                <boxGeometry args={[0.66, 0.02, 0.1]} />
                <meshBasicMaterial color="#555" />
              </mesh>
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}
