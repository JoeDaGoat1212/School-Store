"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { canvasTexture, fontFamily, noRaycast, seededRandom, toonRamp } from "./paint";
import { advanceOf, letterGeometry } from "./text3d";
import { BUILDING, INSIDE, LANES, COUNTER } from "./world-layout";

/*
 * Halloween decorations (they're only up in October; see src/lib/seasons.ts).
 *
 * Outside: glowing jack-o'-lanterns by the doors and on the planters, orange,
 * purple and green lights along the roof, spider webs in the windows, ghosts
 * floating by the sign, bats circling the roof, and a little graveyard on
 * the lawn.
 *
 * Inside: "HAPPY HALLOWEEN" in big 3D letters, paper flags along the walls,
 * cobwebs in the corners, spiders and paper bats hanging from the ceiling,
 * ghosts drifting overhead, a bubbling cauldron by the door, and more
 * pumpkins.
 *
 * Everything is built from simple shapes and drawn pictures (no downloads),
 * and moves a little so the store feels alive.
 */

const PUMPKIN = "#ff7a1a";
const PURPLE = "#7b3fd1";
const SLIME = "#7dff4a";
const NIGHT = "#1d1a24";

// ---- Jack-o'-lanterns -------------------------------------------------------------------------

/** A ribbed, slightly squashed ball (made once, shared by every pumpkin). */
const pumpkinGeometry = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (!g) {
      g = new THREE.SphereGeometry(1, 48, 28);
      const pos = g.attributes.position;
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        const a = Math.atan2(p.z, p.x);
        // 10 ribs: pushed in a little between each one.
        const rib = 1 - 0.07 * (0.5 - 0.5 * Math.cos(a * 10));
        p.x *= rib;
        p.z *= rib;
        // Squashed, with a dip at the top where the stem goes.
        p.y *= 0.8;
        if (p.y > 0.6) p.y -= (p.y - 0.6) * 0.6;
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      g.computeVertexNormals();
    }
    return g;
  };
})();

/**
 * The carved face, drawn on a picture wrapped round the pumpkin: `map` is the
 * skin with the face, `glow` lights up only the face (as if a candle were inside).
 * Three faces: classic, happy and spooky.
 */
const faceCache = new Map<number, { map: THREE.Texture; glow: THREE.Texture }>();
function pumpkinFace(style: number) {
  let hit = faceCache.get(style);
  if (hit) return hit;
  const make = (glowOnly: boolean) => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = glowOnly ? "#000" : PUMPKIN;
    ctx.fillRect(0, 0, 512, 256);
    if (!glowOnly) {
      // Darker lines down the ribs.
      ctx.strokeStyle = "rgba(150,50,0,0.35)";
      ctx.lineWidth = 6;
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo((i / 10) * 512 + 12, 0);
        ctx.lineTo((i / 10) * 512 + 12, 256);
        ctx.stroke();
      }
    }
    // The face sits at the front of the pumpkin (a quarter of the way across the picture).
    ctx.fillStyle = "#ffd23a";
    const cx = 128;
    const cy = 132;
    const tri = (x: number, y: number, s: number, up = true) => {
      ctx.beginPath();
      ctx.moveTo(x - s, y + (up ? s * 0.8 : -s * 0.8));
      ctx.lineTo(x + s, y + (up ? s * 0.8 : -s * 0.8));
      ctx.lineTo(x, y - (up ? s : -s));
      ctx.closePath();
      ctx.fill();
    };
    if (style === 0) {
      tri(cx - 26, cy - 26, 15);
      tri(cx + 26, cy - 26, 15);
      tri(cx, cy - 2, 7);
      // A jagged grin.
      ctx.beginPath();
      ctx.moveTo(cx - 44, cy + 12);
      for (let i = 0; i <= 8; i++) ctx.lineTo(cx - 44 + i * 11, cy + 12 + (i % 2 ? 9 : 0));
      ctx.lineTo(cx + 40, cy + 30);
      ctx.quadraticCurveTo(cx, cy + 50, cx - 40, cy + 30);
      ctx.closePath();
      ctx.fill();
    } else if (style === 1) {
      // Happy: round eyes, a big smile.
      ctx.beginPath();
      ctx.ellipse(cx - 24, cy - 24, 11, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 24, cy - 24, 11, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 42, cy + 6);
      ctx.quadraticCurveTo(cx, cy + 58, cx + 42, cy + 6);
      ctx.quadraticCurveTo(cx, cy + 26, cx - 42, cy + 6);
      ctx.fill();
    } else {
      // Spooky: slanted eyes and a toothy frown.
      ctx.beginPath();
      ctx.moveTo(cx - 44, cy - 38);
      ctx.lineTo(cx - 10, cy - 22);
      ctx.lineTo(cx - 38, cy - 12);
      ctx.closePath();
      ctx.moveTo(cx + 44, cy - 38);
      ctx.lineTo(cx + 10, cy - 22);
      ctx.lineTo(cx + 38, cy - 12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy + 34);
      ctx.quadraticCurveTo(cx, cy, cx + 40, cy + 34);
      for (let i = 0; i <= 6; i++) ctx.lineTo(cx + 40 - i * 13.3, cy + 34 - (i % 2 ? 10 : 0));
      ctx.closePath();
      ctx.fill();
    }
    return canvasTexture(c);
  };
  hit = { map: make(false), glow: make(true) };
  faceCache.set(style, hit);
  return hit;
}

/** A glowing jack-o'-lantern, `size` across, sitting on the ground (or wherever it's put), facing +z. */
export function Pumpkin({ size = 1, face = 0, turn = 0, position = [0, 0, 0] }: { size?: number; face?: number; turn?: number; position?: [number, number, number] }) {
  const { map, glow } = pumpkinFace(face % 3);
  const glowRef = useRef<THREE.MeshToonMaterial>(null);
  const seed = useMemo(() => position[0] * 7.1 + position[2] * 3.3, [position]);
  // The candle inside flickers.
  useFrame((state) => {
    if (glowRef.current) {
      const t = state.clock.elapsedTime * 9 + seed;
      glowRef.current.emissiveIntensity = 1.6 + Math.sin(t) * 0.25 + Math.sin(t * 2.7) * 0.15;
    }
  });
  const r = size / 2;
  return (
    <group position={position} rotation-y={turn}>
      <mesh geometry={pumpkinGeometry()} position-y={r * 0.8} scale={r} castShadow raycast={noRaycast}>
        <meshToonMaterial ref={glowRef} map={map} emissive="#ffffff" emissiveMap={glow} emissiveIntensity={1.6} gradientMap={toonRamp()} />
      </mesh>
      {/* Stem */}
      <mesh position={[0, r * 1.5, 0]} rotation-z={0.25} raycast={noRaycast}>
        <cylinderGeometry args={[r * 0.08, r * 0.13, r * 0.4, 8]} />
        <meshToonMaterial color="#4f6b22" gradientMap={toonRamp()} />
      </mesh>
    </group>
  );
}

// ---- Ghosts -----------------------------------------------------------------------------------

/** A sheet ghost: round head, flaring out to a wavy hem. */
const ghostGeometry = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (!g) {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * (Math.PI / 2);
        pts.push(new THREE.Vector2(Math.sin(a) * 0.55, 0.75 + Math.cos(a) * 0.55));
      }
      pts.push(new THREE.Vector2(0.6, 0.3), new THREE.Vector2(0.7, -0.1), new THREE.Vector2(0.82, -0.45));
      g = new THREE.LatheGeometry(pts, 40);
      const pos = g.attributes.position;
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        if (p.y < -0.2) {
          const a = Math.atan2(p.z, p.x);
          p.y += Math.sin(a * 7) * 0.12;
        }
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      g.computeVertexNormals();
    }
    return g;
  };
})();

/** A friendly ghost that bobs up and down, sways, and (optionally) drifts round in a circle. */
export function Ghost({ position, size = 1, circle = 0, speed = 0.3, phase = 0 }: { position: [number, number, number]; size?: number; circle?: number; speed?: number; phase?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime + phase;
    const a = t * speed;
    g.position.set(position[0] + Math.cos(a) * circle, position[1] + Math.sin(t * 1.6) * 0.3, position[2] + Math.sin(a) * circle);
    // Face the way it's drifting (or sway gently on the spot).
    g.rotation.y = circle > 0 ? -a : Math.sin(t * 0.7) * 0.3;
    g.rotation.z = Math.sin(t * 1.3) * 0.08;
  });
  const white = <meshToonMaterial color="#ffffff" gradientMap={toonRamp()} transparent opacity={0.93} side={THREE.DoubleSide} />;
  return (
    <group ref={ref} position={position} scale={size}>
      <mesh geometry={ghostGeometry()} raycast={noRaycast}>
        {white}
      </mesh>
      {/* Little arms */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.62, 0.35, 0.1]} rotation-z={s * -0.9} scale={[0.14, 0.3, 0.14]} raycast={noRaycast}>
          <sphereGeometry args={[1, 12, 10]} />
          {white}
        </mesh>
      ))}
      {/* Eyes and an "ooh" mouth (on the side it drifts toward) */}
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.95, 0.5]} scale={[0.08, 0.12, 0.05]} raycast={noRaycast}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshBasicMaterial color={NIGHT} />
        </mesh>
      ))}
      <mesh position={[0, 0.7, 0.53]} scale={[0.07, 0.1, 0.04]} raycast={noRaycast}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshBasicMaterial color={NIGHT} />
      </mesh>
    </group>
  );
}

// ---- Bats --------------------------------------------------------------------------------------

/** One bat wing: a scalloped flap (the right wing; the left is a mirror image). */
const wingGeometry = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (!g) {
      const s = new THREE.Shape();
      s.moveTo(0, 0.12);
      s.lineTo(0.55, 0.32);
      s.lineTo(1.25, 0.2);
      s.quadraticCurveTo(1.05, 0.0, 1.0, -0.18);
      s.quadraticCurveTo(0.82, -0.02, 0.68, -0.2);
      s.quadraticCurveTo(0.5, -0.02, 0.32, -0.16);
      s.quadraticCurveTo(0.18, -0.02, 0, -0.1);
      s.closePath();
      g = new THREE.ShapeGeometry(s);
      g.rotateX(-Math.PI / 2); // lie flat; the wing points along +x
    }
    return g;
  };
})();

/** A cartoon bat. `fly`: circling (radius, speed); otherwise it hangs in place flapping slowly. */
export function Bat({ position, size = 1, fly, phase = 0 }: { position: [number, number, number]; size?: number; fly?: { radius: number; speed: number }; phase?: number }) {
  const ref = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime + phase;
    const flap = Math.sin(t * (fly ? 14 : 4)) * (fly ? 0.75 : 0.35);
    if (left.current) left.current.rotation.z = -flap;
    if (right.current) right.current.rotation.z = flap;
    const g = ref.current;
    if (!g) return;
    if (fly) {
      const a = t * fly.speed;
      g.position.set(position[0] + Math.cos(a) * fly.radius, position[1] + Math.sin(t * 2.1) * 0.6, position[2] + Math.sin(a) * fly.radius);
      // Nose pointing along the circle, tipped into the turn.
      g.rotation.set(0, -a + (fly.speed > 0 ? Math.PI : 0), Math.sign(fly.speed) * 0.25);
    } else {
      g.position.set(position[0], position[1] + Math.sin(t * 1.2) * 0.1, position[2]);
      g.rotation.y = Math.sin(t * 0.5) * 0.4;
    }
  });
  const black = <meshToonMaterial color={NIGHT} gradientMap={toonRamp()} side={THREE.DoubleSide} />;
  return (
    <group ref={ref} position={position} scale={size}>
      <mesh scale={[0.18, 0.16, 0.28]} raycast={noRaycast}>
        <sphereGeometry args={[1, 14, 10]} />
        {black}
      </mesh>
      {/* Head with pointy ears and little eyes */}
      <mesh position={[0, 0.06, 0.28]} scale={0.13} raycast={noRaycast}>
        <sphereGeometry args={[1, 12, 10]} />
        {black}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.07, 0.2, 0.28]} rotation-z={s * -0.3} raycast={noRaycast}>
          <coneGeometry args={[0.045, 0.14, 6]} />
          {black}
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.05, 0.08, 0.39]} raycast={noRaycast}>
          <sphereGeometry args={[0.022, 8, 6]} />
          <meshBasicMaterial color="#ffd23a" toneMapped={false} />
        </mesh>
      ))}
      <group ref={right} position-x={0.12}>
        <mesh geometry={wingGeometry()} raycast={noRaycast}>
          {black}
        </mesh>
      </group>
      <group ref={left} position-x={-0.12} scale-x={-1}>
        <mesh geometry={wingGeometry()} raycast={noRaycast}>
          {black}
        </mesh>
      </group>
    </group>
  );
}

// ---- Spider webs and spiders --------------------------------------------------------------------

/** A quarter web from a corner: spokes and sagging threads between them. Corner at (0,0), web toward +x and -y. */
function webGeometry(radius: number, spokes = 7, rings = 6) {
  const pts: number[] = [];
  const at = (k: number, r: number) => {
    const a = (k / (spokes - 1)) * (Math.PI / 2);
    return [Math.cos(a) * r, -Math.sin(a) * r, 0];
  };
  for (let k = 0; k < spokes; k++) pts.push(0, 0, 0, ...at(k, radius));
  for (let i = 1; i <= rings; i++) {
    const r = (i / rings) * radius;
    for (let k = 0; k < spokes - 1; k++) {
      // Each thread sags in toward the corner in the middle.
      const a = at(k, r);
      const b = at(k + 1, r);
      const ma = ((k + 0.5) / (spokes - 1)) * (Math.PI / 2);
      const m = [Math.cos(ma) * r * 0.88, -Math.sin(ma) * r * 0.88, 0];
      pts.push(...a, ...m, ...m, ...b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

/** A cobweb in a corner. `flipX` / `flipY` turn it to fit the corner it's in. */
export function Web({ position, radius = 1.6, flipX = false, flipY = false, rotationY = 0 }: { position: [number, number, number]; radius?: number; flipX?: boolean; flipY?: boolean; rotationY?: number }) {
  const lines = useMemo(() => {
    const l = new THREE.LineSegments(webGeometry(radius), new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.75 }));
    l.raycast = noRaycast;
    return l;
  }, [radius]);
  useEffect(
    () => () => {
      lines.geometry.dispose();
      (lines.material as THREE.Material).dispose();
    },
    [lines],
  );
  return (
    <group position={position} rotation-y={rotationY} scale={[flipX ? -1 : 1, flipY ? -1 : 1, 1]}>
      <primitive object={lines} />
    </group>
  );
}

/** A spider dangling on a thread from the ceiling, slowly going up and down. */
export function HangingSpider({ x, z, top, low, phase = 0 }: { x: number; z: number; top: number; low: number; phase?: number }) {
  const spider = useRef<THREE.Group>(null);
  const thread = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.6 + phase;
    const y = low + (Math.sin(t) * 0.5 + 0.5) * 1.6;
    if (spider.current) {
      spider.current.position.y = y;
      spider.current.rotation.y = Math.sin(t * 1.7) * 0.6;
    }
    if (thread.current) {
      thread.current.position.y = (top + y) / 2;
      thread.current.scale.y = top - y;
    }
  });
  const black = <meshToonMaterial color={NIGHT} gradientMap={toonRamp()} />;
  return (
    <group position={[x, 0, z]}>
      <mesh ref={thread} raycast={noRaycast}>
        <cylinderGeometry args={[0.012, 0.012, 1, 4]} />
        <meshBasicMaterial color="#e8e8e8" />
      </mesh>
      <group ref={spider}>
        <mesh scale={[0.32, 0.26, 0.38]} raycast={noRaycast}>
          <sphereGeometry args={[1, 14, 10]} />
          {black}
        </mesh>
        <mesh position={[0, 0.02, 0.38]} scale={0.18} raycast={noRaycast}>
          <sphereGeometry args={[1, 12, 10]} />
          {black}
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.07, 0.08, 0.53]} raycast={noRaycast}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshBasicMaterial color="#ff3b3b" toneMapped={false} />
          </mesh>
        ))}
        {/* Eight bent legs */}
        {[-1, 1].flatMap((s) =>
          [0.25, 0.08, -0.08, -0.25].map((z, i) => (
            <group key={`${s}${i}`} position={[s * 0.25, 0, z]} rotation-y={s * (0.3 - i * 0.2)}>
              <mesh position={[s * 0.25, 0.12, 0]} rotation-z={s * -0.7} raycast={noRaycast}>
                <cylinderGeometry args={[0.03, 0.03, 0.55, 5]} />
                {black}
              </mesh>
              <mesh position={[s * 0.58, -0.08, 0]} rotation-z={s * 0.8} raycast={noRaycast}>
                <cylinderGeometry args={[0.025, 0.02, 0.6, 5]} />
                {black}
              </mesh>
            </group>
          )),
        )}
      </group>
    </group>
  );
}

// ---- Flags and lights on strings ------------------------------------------------------------------

/** Points along a string that sags between hooks: `swags` dips from `a` to `b`. */
function sagging(a: THREE.Vector3, b: THREE.Vector3, swags: number, sag: number, perSwag: number) {
  const out: { p: THREE.Vector3; t: number }[] = [];
  const n = swags * perSwag;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const local = (t * swags) % 1;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(local * Math.PI) * sag;
    out.push({ p, t });
  }
  return out;
}

/**
 * A string of paper flags (orange, black, purple, green) hung along a wall,
 * dipping between hooks. `facing` is which way the flags face (radians).
 */
export function Bunting({ from, to, swags, facing }: { from: [number, number, number]; to: [number, number, number]; swags: number; facing: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { flags, string } = useMemo(() => {
    const pts = sagging(new THREE.Vector3(...from), new THREE.Vector3(...to), swags, 0.9, 7);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((x) => x.p)), new THREE.LineBasicMaterial({ color: "#2a2430" }));
    line.raycast = noRaycast;
    return { flags: pts.filter((_, i) => i % 7 !== 0), string: line };
  }, [from, to, swags]);
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.32, 0);
    s.lineTo(0.32, 0);
    s.lineTo(0, -0.62);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  useEffect(
    () => () => {
      shape.dispose();
      string.geometry.dispose();
      (string.material as THREE.Material).dispose();
    },
    [shape, string],
  );
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    const colors = [PUMPKIN, NIGHT, PURPLE, "#3fbf4a"].map((c) => new THREE.Color(c));
    flags.forEach((f, i) => {
      o.position.copy(f.p);
      o.rotation.set(0, facing, ((i * 13) % 5 - 2) * 0.04);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, colors[i % colors.length]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [flags, facing]);
  return (
    <group>
      <primitive object={string} />
      <instancedMesh ref={ref} args={[shape, undefined, flags.length]} raycast={noRaycast}>
        <meshToonMaterial gradientMap={toonRamp()} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}

/** A string of round party lights (orange, purple, green) that twinkle in turn. */
export function StringLights({ from, to, swags, sag = 0.6 }: { from: [number, number, number]; to: [number, number, number]; swags: number; sag?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { bulbs, string } = useMemo(() => {
    const pts = sagging(new THREE.Vector3(...from), new THREE.Vector3(...to), swags, sag, 6);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((x) => x.p)), new THREE.LineBasicMaterial({ color: "#1d1a24" }));
    line.raycast = noRaycast;
    return { bulbs: pts, string: line };
  }, [from, to, swags, sag]);
  useEffect(
    () => () => {
      string.geometry.dispose();
      (string.material as THREE.Material).dispose();
    },
    [string],
  );
  const palette = useMemo(() => [new THREE.Color("#ff8a1f").multiplyScalar(1.6), new THREE.Color("#b46bff").multiplyScalar(1.5), new THREE.Color("#7dff4a").multiplyScalar(1.4)], []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    bulbs.forEach((b, i) => {
      o.position.copy(b.p).y -= 0.12;
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [bulbs]);
  const step = useRef(-1);
  const dim = useMemo(() => new THREE.Color(), []);
  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    // Every few tenths of a second, a different third of the bulbs dims down.
    const now = Math.floor(state.clock.elapsedTime * 2.5);
    if (now === step.current) return;
    step.current = now;
    bulbs.forEach((_, i) => {
      const c = palette[i % 3];
      mesh.setColorAt(i, (i + now) % 3 === 0 ? dim.copy(c).multiplyScalar(0.35) : c);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <primitive object={string} />
      <instancedMesh ref={ref} args={[undefined, undefined, bulbs.length]} raycast={noRaycast}>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

// ---- Graveyard -----------------------------------------------------------------------------------

const ripCache = new Map<string, THREE.Texture>();
function ripTexture(text: string) {
  let t = ripCache.get(text);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#9da3a8";
    ctx.fillRect(0, 0, 256, 256);
    // Speckles of old stone.
    const rand = seededRandom(text.length * 31 + 7);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(rand() * 256, rand() * 256, 3, 3);
    }
    ctx.fillStyle = "#4b5056";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 78px ${fontFamily("display")}`;
    ctx.fillText(text, 128, 120);
    t = canvasTexture(c);
    ripCache.set(text, t);
  }
  return t;
}

/** A rounded gravestone with words carved on the front, leaning a little. */
export function Tombstone({ position, text = "RIP", turn = 0, lean = 0 }: { position: [number, number, number]; text?: string; turn?: number; lean?: number }) {
  return (
    <group position={position} rotation={[lean, turn, lean * 0.5]}>
      <RoundedBox args={[1.6, 2.2, 0.4]} radius={0.18} position-y={1.0} castShadow raycast={noRaycast}>
        <meshToonMaterial color="#9da3a8" gradientMap={toonRamp()} />
      </RoundedBox>
      <mesh position={[0, 1.95, 0]} rotation-x={Math.PI / 2} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[0.8, 0.8, 0.4, 24, 1, false, -Math.PI / 2, Math.PI]} />
        <meshToonMaterial color="#9da3a8" gradientMap={toonRamp()} />
      </mesh>
      <mesh position={[0, 1.3, 0.205]} raycast={noRaycast}>
        <planeGeometry args={[1.3, 1.3]} />
        <meshToonMaterial map={ripTexture(text)} gradientMap={toonRamp()} />
      </mesh>
      {/* A little mound of earth in front */}
      <mesh position={[0, 0, 1.0]} scale={[0.8, 0.18, 1.1]} raycast={noRaycast}>
        <sphereGeometry args={[1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshToonMaterial color="#5b4a33" gradientMap={toonRamp()} />
      </mesh>
    </group>
  );
}

// ---- Cauldron -----------------------------------------------------------------------------------

/** A black cauldron on little legs, full of glowing green bubbling brew. */
export function Cauldron({ position }: { position: [number, number, number] }) {
  const pot = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = -Math.PI / 2 + (i / 14) * Math.PI * 0.82;
      pts.push(new THREE.Vector2(Math.cos(a) * 1.1, 1.1 + Math.sin(a) * 1.0));
    }
    pts.push(new THREE.Vector2(0.86, 2.05), new THREE.Vector2(0.98, 2.12), new THREE.Vector2(0.98, 2.2), new THREE.Vector2(0.84, 2.2));
    return new THREE.LatheGeometry(pts, 36);
  }, []);
  useEffect(() => () => pot.dispose(), [pot]);
  const bubbles = useRef<(THREE.Mesh | null)[]>([]);
  const liquid = useRef<THREE.MeshBasicMaterial>(null);
  const rand = useMemo(() => {
    const r = seededRandom(11);
    return Array.from({ length: 7 }, () => ({ x: (r() - 0.5) * 1.1, z: (r() - 0.5) * 1.1, speed: 0.5 + r() * 0.8, off: r() * 3, size: 0.08 + r() * 0.1 }));
  }, []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    rand.forEach((b, i) => {
      const m = bubbles.current[i];
      if (!m) return;
      // Each bubble rises a little, swells and pops, then starts again.
      const k = (t * b.speed + b.off) % 1;
      m.position.set(b.x, 2.0 + k * 0.35, b.z);
      m.scale.setScalar(b.size * (0.6 + k * 0.8) * (k > 0.9 ? (1 - k) * 10 : 1));
    });
    if (liquid.current) liquid.current.color.setRGB(0.45 + Math.sin(t * 2) * 0.05, 1, 0.3);
  });
  return (
    <group position={position}>
      <mesh geometry={pot} castShadow raycast={noRaycast}>
        <meshStandardMaterial color="#1b1a1f" metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.75, 0.15, Math.sin(a) * 0.75]} raycast={noRaycast}>
            <cylinderGeometry args={[0.1, 0.07, 0.4, 8]} />
            <meshStandardMaterial color="#1b1a1f" metalness={0.6} roughness={0.35} />
          </mesh>
        );
      })}
      <mesh position-y={2.02} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <circleGeometry args={[0.9, 32]} />
        <meshBasicMaterial ref={liquid} color={SLIME} toneMapped={false} />
      </mesh>
      {rand.map((b, i) => (
        <mesh key={i} ref={(m) => void (bubbles.current[i] = m)} raycast={noRaycast}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial color="#b6ff8c" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// ---- Big 3D words ----------------------------------------------------------------------------------

/** "HAPPY HALLOWEEN" in big orange 3D letters with a purple shadow, each letter bobbing in turn. */
export function SpookyWords({ text, size, position }: { text: string; size: number; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const chars = [...text];
  const gap = size * 0.08;
  const widths = chars.map((c) => advanceOf(c, size));
  const total = widths.reduce((a, b) => a + b + gap, -gap);
  let cursor = -total / 2;
  const xs = widths.map((w) => {
    const x = cursor + w / 2;
    cursor += w + gap;
    return x;
  });
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    ref.current?.children.forEach((c, i) => {
      c.position.y = Math.sin(t * 2.2 - i * 0.5) * size * 0.08;
      c.rotation.z = Math.sin(t * 1.4 - i * 0.7) * 0.05;
    });
  });
  return (
    <group position={position}>
      <group ref={ref}>
        {chars.map((ch, i) =>
          ch === " " ? (
            <group key={i} />
          ) : (
            <group key={i} position-x={xs[i]}>
              <mesh geometry={letterGeometry(ch, size, size * 0.3)} raycast={noRaycast}>
                <meshStandardMaterial color={PUMPKIN} emissive="#ff5a00" emissiveIntensity={0.45} roughness={0.4} />
              </mesh>
              {/* A purple copy just behind and below, like a drop shadow */}
              <mesh geometry={letterGeometry(ch, size, size * 0.3)} position={[size * 0.06, -size * 0.06, -size * 0.2]} raycast={noRaycast}>
                <meshStandardMaterial color={PURPLE} roughness={0.5} />
              </mesh>
            </group>
          ),
        )}
      </group>
    </group>
  );
}

// ---- Putting it all up --------------------------------------------------------------------------

/** The decorations on the store front (drawn with the store, in store units). */
export function HalloweenOutside() {
  const { halfWidth: HW, height: H, windowX: [w0, w1], windowY: [, y1] } = BUILDING;
  return (
    <group>
      {/* Lights along the top of the store front */}
      <StringLights from={[-HW + 0.3, H + 1.3, 0.55]} to={[HW - 0.3, H + 1.3, 0.55]} swags={10} sag={0.7} />
      {/* Jack-o'-lanterns by the doors… */}
      <Pumpkin position={[-5.0, 0.3, 1.6]} size={1.3} face={0} turn={0.2} />
      <Pumpkin position={[-4.6, 0.3, 2.7]} size={0.8} face={1} turn={0.4} />
      <Pumpkin position={[5.0, 0.3, 1.6]} size={1.3} face={2} turn={-0.2} />
      <Pumpkin position={[4.5, 0.3, 2.7]} size={0.85} face={0} turn={-0.4} />
      {/* …and on the planters */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Pumpkin position={[s * ((w0 + w1) / 2 - 2.6), 0.9, 1.5]} size={0.9} face={1} turn={s * -0.2} />
          <Pumpkin position={[s * ((w0 + w1) / 2 + 2.8), 0.9, 1.5]} size={0.75} face={2} turn={s * 0.2} />
        </group>
      ))}
      {/* Spider webs in the top corners of the windows */}
      <Web position={[-w1 + 0.1, y1 - 0.1, 0.1]} radius={2} />
      <Web position={[w1 - 0.1, y1 - 0.1, 0.1]} radius={2} flipX />
      <Web position={[-w0 - 0.1, y1 - 0.1, 0.1]} radius={1.2} flipX />
      <Web position={[w0 + 0.1, y1 - 0.1, 0.1]} radius={1.2} />
      {/* Ghosts by the sign, bats circling the roof */}
      <Ghost position={[-14, 11.2, 2.4]} size={1.3} />
      <Ghost position={[14.5, 10.8, 2.6]} size={1.15} phase={2} />
      {[
        [13, 0.35, 0, 17],
        [15, 0.3, 2, 18.5],
        [11, 0.42, 4, 16],
        [16.5, -0.28, 1, 19],
        [12.5, -0.33, 3, 17.5],
        [14, 0.38, 5.5, 20],
      ].map(([radius, speed, phase, y], i) => (
        // Bats circle over the roof (wider for a bigger store).
        <Bat key={i} position={[0, y, -BUILDING.depth / 2]} size={1.6} fly={{ radius: radius * (BUILDING.halfWidth / 20), speed }} phase={phase} />
      ))}
    </group>
  );
}

/** A little graveyard on each lawn, either side of the parking lot (world units, like the lot). */
export function HalloweenLawn() {
  return (
    <group>
      {[
        [-32, 8, 0.5, "RIP", 0.05],
        [-34.5, 12.5, 0.3, "BOO", -0.08],
        [-31.5, 16, 0.6, "RIP", 0.1],
        [-35, 19.5, 0.4, "EEK", -0.05],
        [32, 9, -0.5, "RIP", -0.07],
        [34.5, 14, -0.3, "BOO", 0.06],
        [31.8, 18.5, -0.6, "RIP", 0],
      ].map(([x, z, turn, text, lean], i) => (
        // Just past the edges of the parking lot.
        <Tombstone key={i} position={[Number(x) + Math.sign(Number(x)) * 8, 0, Number(z)]} turn={Number(turn) + (Number(x) < 0 ? Math.PI / 2 : -Math.PI / 2)} text={String(text)} lean={Number(lean)} />
      ))}
      <Pumpkin position={[-38, 0, 11]} size={0.7} face={2} turn={1.2} />
      <Pumpkin position={[38.5, 0, 12]} size={0.65} face={0} turn={-1.2} />
    </group>
  );
}

/** All the decorations inside the store. */
export function HalloweenInside({ fridgeX }: { fridgeX: number }) {
  const { left, right, back, front } = INSIDE;
  const top = BUILDING.height;
  const flagY = 8.6;
  return (
    <group>
      {/* "HAPPY HALLOWEEN" on the back wall, above the shelves */}
      <SpookyWords text="HAPPY HALLOWEEN" size={1.15} position={[-2, 10.2, back + 0.45]} />
      {/* Paper flags round the walls */}
      <Bunting from={[left + 0.6, flagY, back + 0.15]} to={[right - 0.6, flagY, back + 0.15]} swags={6} facing={0} />
      <Bunting from={[left + 0.15, flagY, front - 1]} to={[left + 0.15, flagY, back + 0.6]} swags={4} facing={Math.PI / 2} />
      <Bunting from={[right - 0.15, flagY, back + 0.6]} to={[right - 0.15, flagY, front - 1]} swags={4} facing={-Math.PI / 2} />
      {/* Cobwebs up in the corners */}
      <Web position={[left + 0.05, top - 0.05, back + 0.05]} radius={2.6} />
      <Web position={[right - 0.05, top - 0.05, back + 0.05]} radius={2.6} flipX />
      <Web position={[left + 0.05, top - 0.05, front - 0.05]} radius={2.2} rotationY={Math.PI} flipX />
      <Web position={[right - 0.05, top - 0.05, front - 0.05]} radius={2.2} rotationY={Math.PI} />
      {/* Spiders and paper bats hanging from the ceiling */}
      <HangingSpider x={-5} z={-7} top={top} low={8.6} />
      <HangingSpider x={9} z={-27} top={top} low={8.2} phase={2} />
      <HangingSpider x={-19} z={-24} top={top} low={8.8} phase={4} />
      {[
        [-7, 10.2, -12],
        [2.5, 10.6, -16],
        [-12, 10, -23],
        [11, 10.4, -6],
        [15, 10.2, -18],
        [-20, 10.3, -30],
        [22, 10.1, -26],
      ].map(([x, y, z], i) => (
        <group key={i}>
          <mesh position={[x, (top + y) / 2 + 0.2, z]} raycast={noRaycast}>
            <cylinderGeometry args={[0.01, 0.01, top - y - 0.4, 4]} />
            <meshBasicMaterial color="#e8e8e8" />
          </mesh>
          <Bat position={[x, y, z]} size={1.3} phase={i * 1.7} />
        </group>
      ))}
      {/* Ghosts drifting round overhead */}
      <Ghost position={[-8, 9.6, -22]} size={1.1} circle={3} speed={0.25} />
      <Ghost position={[12, 10, -19]} size={0.95} circle={2.5} speed={-0.3} phase={3} />
      {/* A bubbling cauldron by the door */}
      <Cauldron position={[3.0, 0, -8]} />
      {/* Jack-o'-lanterns: by the door, either side of the fridge, and on the checkout counters */}
      <Pumpkin position={[-4.4, 0, -4]} size={1.1} face={0} turn={0.3} />
      <Pumpkin position={[-3.4, 0, -3.2]} size={0.7} face={1} turn={0.5} />
      <Pumpkin position={[fridgeX - 5.2, 0, back + 2]} size={1.2} face={2} turn={0.3} />
      <Pumpkin position={[fridgeX + 5.2, 0, back + 2]} size={1} face={1} turn={-0.3} />
      {LANES.map((l) => (
        <Pumpkin key={l.number} position={[l.x, COUNTER, l.front - l.length + 0.35]} size={0.55} face={l.number} turn={-Math.PI / 2 + 0.3} />
      ))}
    </group>
  );
}

/** The cashier's witch hat (worn instead of the cap at Halloween). */
export function WitchHat() {
  return (
    <group position-y={0.28}>
      <mesh raycast={noRaycast}>
        <cylinderGeometry args={[0.72, 0.72, 0.05, 32]} />
        <meshToonMaterial color={NIGHT} gradientMap={toonRamp()} />
      </mesh>
      <mesh position={[0, 0.5, -0.04]} rotation-x={-0.12} raycast={noRaycast}>
        <coneGeometry args={[0.38, 1.0, 24]} />
        <meshToonMaterial color={NIGHT} gradientMap={toonRamp()} />
      </mesh>
      <mesh position-y={0.1} raycast={noRaycast}>
        <cylinderGeometry args={[0.39, 0.4, 0.12, 24]} />
        <meshToonMaterial color={PUMPKIN} gradientMap={toonRamp()} />
      </mesh>
    </group>
  );
}
