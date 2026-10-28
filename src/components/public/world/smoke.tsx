"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/*
 * Tyre smoke: soft grey puffs that billow up, grow and fade away. Anything
 * can call puff(x, y, z) to start one (drive.tsx does, from the back wheels,
 * while you drift or skid). All the puffs are drawn in one go as "points"
 * with a tiny shader that makes each one a soft round blob.
 */

const MAX = 260; // puffs at once (the oldest gets reused)
const LIFE = 1.5; // seconds a puff lasts

const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
/** 0 = just started … 1 = gone. */
const life = new Float32Array(MAX).fill(1);
const size = new Float32Array(MAX);
let next = 0;

/** Start a puff of smoke at (x, y, z), drifting along at (vx, vz). */
export function puff(x: number, y: number, z: number, vx = 0, vz = 0) {
  const i = next;
  next = (next + 1) % MAX;
  pos[i * 3] = x + (Math.random() - 0.5) * 0.6;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
  vel[i * 3] = vx * 0.15 + (Math.random() - 0.5) * 1.6;
  vel[i * 3 + 1] = 0.9 + Math.random() * 0.8;
  vel[i * 3 + 2] = vz * 0.15 + (Math.random() - 0.5) * 1.6;
  life[i] = 0;
  size[i] = 3.5 + Math.random() * 2.5;
}

/** Shared by the shader: how many pixels one unit is, one unit away (set every frame). */
const uniforms = { uScale: { value: 400 } };

const vertexShader = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  uniform float uScale;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Starts small and billows out; nothing at all once it's gone.
    float grow = 0.3 + 0.7 * sqrt(aLife);
    gl_PointSize = aLife >= 1.0 ? 0.0 : aSize * grow * uScale / max(-mv.z, 0.5);
  }
`;
const fragmentShader = /* glsl */ `
  varying float vLife;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float soft = 1.0 - smoothstep(0.2, 1.0, d);
    // Fade in quickly, fade out slowly.
    float a = soft * smoothstep(0.0, 0.06, vLife) * (1.0 - vLife) * 0.6;
    gl_FragColor = vec4(vec3(0.9, 0.9, 0.92) - d * 0.08, a);
  }
`;

export function Smoke() {
  const geometry = useRef<THREE.BufferGeometry>(null);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    for (let i = 0; i < MAX; i++) {
      if (life[i] >= 1) continue;
      life[i] = Math.min(1, life[i] + dt / LIFE);
      // Rise, spread, and slow down as the air takes it.
      const drag = Math.exp(-1.6 * dt);
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] += vel[i * 3 + k] * dt;
        vel[i * 3 + k] *= drag;
      }
    }
    const cam = state.camera as THREE.PerspectiveCamera;
    uniforms.uScale.value = (state.size.height * state.viewport.dpr) / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const g = geometry.current;
    if (g) {
      g.attributes.position.needsUpdate = true;
      g.attributes.aLife.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
    }
  });

  return (
    <points frustumCulled={false} renderOrder={2}>
      <bufferGeometry ref={geometry}>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        <bufferAttribute attach="attributes-aLife" args={[life, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[size, 1]} />
      </bufferGeometry>
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} transparent depthWrite={false} />
    </points>
  );
}
