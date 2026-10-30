"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { canvasTexture, fontFamily, noRaycast } from "./paint";
import { mat } from "./buildings";
import { BroadleafTrees, SpruceTrees, type TreeSpot } from "./nature";
import { Near } from "./near";
import { Villa } from "./villa";
import { GOLF } from "./world-map";
import { CLUB, HOLES, HOUSE_LOTS, RANGE, SURF, TREES, YARD, golfGrids, golfHeight, golfWaters } from "./golf-course";
import { golf } from "./golf-state";
import { BAG } from "./golf-physics";
import { Bridges, Clubhouse, ClockTowers, DrivingRange, Grandstands, TeeFurniture } from "./golf-buildings";

/*
 * Firebird Ridge Golf Club, drawn: the land itself (rolling rough, striped
 * fairways, cross-cut greens, raked bunkers, the cart path, all from the
 * course's grids in golf-course.ts), its lakes with rippling water and a
 * fountain, the flags, the trees, the houses down the sides of the holes,
 * the clubhouse, the range, the grandstands and the clock towers
 * (golf-buildings.tsx), and the game's own bits: your ball (with a beacon
 * over it so you can find it), the shot tracer and the aim ring.
 *
 * Working the course out takes about a second, so it waits until the rest
 * of the world's loaded and the browser's idle.
 */

export function Golf() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const go = () => {
      golfGrids();
      setReady(true);
    };
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    const t = window.setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 4000 }) : go()), 1500);
    return () => window.clearTimeout(t);
  }, []);
  if (!ready) return null;
  return (
    <group>
      <Ground />
      <Lakes />
      <Bridges />
      <Flags />
      <TeeFurniture />
      <CourseTrees />
      <Houses />
      <Clubhouse />
      <DrivingRange />
      <Grandstands />
      <ClockTowers />
      <PracticeGreen />
      <BallAndTracer />
    </group>
  );
}

// ---- The land ----------------------------------------------------------------------------------

const GROUND_VERT_HEAD = /* glsl */ `
  varying vec3 vGW;
`;
const GROUND_FRAG_HEAD = /* glsl */ `
  varying vec3 vGW;
  uniform sampler2D uMaskA;
  uniform sampler2D uMaskB;
  uniform vec4 uBox;
  float gHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float gNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
  }
  float gFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * gNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
`;
const GROUND_COLOR = /* glsl */ `
  {
    vec2 p = vGW.xz;
    vec2 uv = (p - uBox.xy) / uBox.zw;
    vec4 A = texture2D(uMaskA, uv);
    vec4 B = texture2D(uMaskB, uv);
    float big = gFbm(p * 0.018);
    float mid = gFbm(p * 0.11);
    float fine = gNoise(p * 2.3);
    float dist = length(vGW - cameraPosition);
    float near = 1.0 - smoothstep(60.0, 260.0, dist);

    // Rough: long grass in patches of colour, drier straw-coloured hollows, clover-dark clumps.
    vec3 rough = mix(vec3(0.25, 0.38, 0.13), vec3(0.34, 0.45, 0.17), big);
    rough *= 0.86 + 0.26 * mid;
    rough = mix(rough, vec3(0.45, 0.45, 0.22), smoothstep(0.6, 0.78, gFbm(p * 0.03 + 9.0)) * 0.45);
    rough *= 1.0 + (fine - 0.5) * 0.18 * near;
    // Fairway: short, brighter, with mowing stripes.
    float stripe = (B.r - 0.5) * 2.0;
    vec3 fair = mix(vec3(0.34, 0.56, 0.2), vec3(0.4, 0.6, 0.22), big) * (1.0 + stripe * 0.075);
    fair *= 1.0 + (fine - 0.5) * 0.06 * near;
    // Tees: like the fairway, mown across.
    vec3 tee = vec3(0.33, 0.54, 0.19) * (1.0 + 0.05 * sign(sin(p.x * 0.9 + p.y * 0.9)));
    // Greens: fine and smooth, cut in a cross-hatch; the fringe (the collar) a shade longer.
    float cA = step(0.5, fract((p.x + p.y) * 0.105));
    float cB = step(0.5, fract((p.x - p.y) * 0.105));
    vec3 grn = vec3(0.36, 0.62, 0.25) * (0.95 + 0.04 * (cA + cB)) * (1.0 + (mid - 0.5) * 0.04);
    vec3 fringe = vec3(0.33, 0.55, 0.2) * (1.0 + (fine - 0.5) * 0.05);
    // The range: wide stripes across, and divot scars near the tee.
    vec3 range = vec3(0.36, 0.57, 0.21) * (1.0 + 0.07 * sign(sin(p.y * 0.38)));
    range *= 1.0 - 0.25 * step(0.93, gNoise(p * 1.4)) * (1.0 - smoothstep(${(RANGE.teeZ + 8).toFixed(1)}, ${(RANGE.teeZ + 40).toFixed(1)}, p.y));
    // Sand: pale, with rake lines.
    vec3 sand = vec3(0.86, 0.79, 0.62) * (0.93 + 0.1 * fine) * (1.0 - 0.05 * near * step(0.6, fract(p.x * 3.1 + sin(p.y * 0.8) * 0.6)));
    // The cart path and paving: concrete, with joints.
    vec3 conc = vec3(0.64, 0.63, 0.6) * (0.92 + 0.12 * fine) * (1.0 - 0.18 * step(0.97, fract(p.x * 0.33 + p.y * 0.33)));
    vec3 mud = vec3(0.24, 0.22, 0.15);

    vec3 col = rough;
    col = mix(col, fair, smoothstep(0.35, 0.65, A.r));
    col = mix(col, range, smoothstep(0.3, 0.7, B.b));
    col = mix(col, tee, smoothstep(0.3, 0.7, B.g));
    float fringeW = clamp(A.g * 2.0, 0.0, 1.0);
    float greenW = clamp(A.g * 2.0 - 1.0, 0.0, 1.0);
    col = mix(col, fringe, smoothstep(0.2, 0.8, fringeW));
    col = mix(col, grn, smoothstep(0.3, 0.75, greenW));
    // A darker, longer "first cut" ring round each bunker, then the sand.
    col *= 1.0 - 0.25 * (smoothstep(0.05, 0.3, A.b) - smoothstep(0.35, 0.55, A.b));
    col = mix(col, sand, smoothstep(0.38, 0.58, A.b));
    col = mix(col, conc, smoothstep(0.35, 0.6, A.a));
    col = mix(col, mud, smoothstep(0.3, 0.7, B.a));
    // Steep banks: thinner grass, a little earth showing.
    vec3 fn = normalize(cross(dFdx(vGW), dFdy(vGW)));
    float steep = smoothstep(0.86, 0.6, abs(fn.y)) * (1.0 - greenW) * (1.0 - smoothstep(0.4, 0.6, A.a));
    col = mix(col, vec3(0.38, 0.36, 0.22), steep * 0.55);
    // Big soft cloud-like light and dark across the land (it reads as scale from far off).
    col *= 0.93 + 0.14 * gFbm(p * 0.006 + 3.0);
    diffuseColor.rgb = pow(col, vec3(2.2));
    gRough = mix(0.96, 0.82, greenW);
    gRough = mix(gRough, 0.99, smoothstep(0.38, 0.58, A.b));
  }
`;

function groundMaterial() {
  const g = golfGrids();
  const S = g.cell;
  const A = new Uint8Array(g.nx * g.nz * 4);
  const Bm = new Uint8Array(g.nx * g.nz * 4);
  for (let k = 0; k < g.nx * g.nz; k++) {
    const s = g.surface[k];
    const o = k * 4;
    A[o] = s === SURF.fairway ? 255 : 0;
    A[o + 1] = s === SURF.green ? 255 : s === SURF.fringe ? 128 : 0;
    A[o + 2] = s === SURF.bunker ? 255 : 0;
    A[o + 3] = s === SURF.path || s === SURF.paved ? 255 : 0;
    Bm[o] = g.stripe[k] ? 255 : 0;
    Bm[o + 1] = s === SURF.tee ? 255 : 0;
    Bm[o + 2] = s === SURF.range ? 255 : 0;
    Bm[o + 3] = s === SURF.water ? 255 : 0;
  }
  const tex = (data: Uint8Array) => {
    const t = new THREE.DataTexture(data, g.nx, g.nz, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  const uniforms = { uMaskA: { value: tex(A) }, uMaskB: { value: tex(Bm) }, uBox: { value: new THREE.Vector4(GOLF.x0, GOLF.z0, g.nx * S, g.nz * S) } };
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, metalness: 0 });
  m.userData.keepLook = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${GROUND_VERT_HEAD}`)
      .replace("#include <project_vertex>", "#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${GROUND_FRAG_HEAD}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\nfloat gRough = 0.95;\n${GROUND_COLOR}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = gRough;");
  };
  m.customProgramCacheKey = () => "golf-ground-1";
  return m;
}

/** One square of the land, every `step` samples, with a skirt hanging down its edges (so neighbours drawn at different detail don't show gaps). */
function chunkGeometry(i0: number, j0: number, n: number, step: number) {
  const g = golfGrids();
  const H = (i: number, j: number) => g.heights[Math.min(g.hnz - 1, j) * g.hnx + Math.min(g.hnx - 1, i)];
  const cells = Math.ceil(n / step);
  const side = cells + 1;
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const at = (a: number, b: number) => {
    const i = Math.min(g.hnx - 1, i0 + a * step);
    const j = Math.min(g.hnz - 1, j0 + b * step);
    return { i, j };
  };
  for (let b = 0; b < side; b++)
    for (let a = 0; a < side; a++) {
      const { i, j } = at(a, b);
      pos.push(GOLF.x0 + i * g.hcell, H(i, j), GOLF.z0 + j * g.hcell);
      const sx = (H(i + 1, j) - H(Math.max(0, i - 1), j)) / (2 * g.hcell);
      const sz = (H(i, j + 1) - H(i, Math.max(0, j - 1))) / (2 * g.hcell);
      const l = Math.hypot(sx, 1, sz);
      nor.push(-sx / l, 1 / l, -sz / l);
    }
  for (let b = 0; b < cells; b++)
    for (let a = 0; a < cells; a++) {
      const p = b * side + a;
      idx.push(p, p + side, p + 1, p + 1, p + side, p + side + 1);
    }
  // The skirt.
  const ring: number[] = [];
  for (let a = 0; a < side; a++) ring.push(a);
  for (let b = 1; b < side; b++) ring.push(b * side + cells);
  for (let a = cells - 1; a >= 0; a--) ring.push(cells * side + a);
  for (let b = cells - 1; b > 0; b--) ring.push(b * side);
  ring.push(0);
  const base = pos.length / 3;
  ring.forEach((v, k) => {
    pos.push(pos[v * 3], pos[v * 3 + 1] - 1.5, pos[v * 3 + 2]);
    nor.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
    if (k > 0) {
      const a = ring[k - 1];
      const c = base + k - 1;
      const d = base + k;
      idx.push(a, c, v, v, c, d, a, v, c, v, d, c);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

function Ground() {
  const root = useMemo(() => {
    const g = golfGrids();
    const material = groundMaterial();
    const group = new THREE.Group();
    const N = 48;
    for (let j0 = 0; j0 < g.hnz - 1; j0 += N)
      for (let i0 = 0; i0 < g.hnx - 1; i0 += N) {
        const n = N;
        const lod = new THREE.LOD();
        for (const [step, distance] of [
          [1, 0],
          [2, 220],
          [6, 520],
        ] as const) {
          const mesh = new THREE.Mesh(chunkGeometry(i0, j0, n, step), material);
          mesh.receiveShadow = true;
          mesh.raycast = noRaycast;
          lod.addLevel(mesh, distance);
        }
        // LOD measures from the object's position: put it at the square's middle.
        const c = new THREE.Vector3();
        (lod.levels[0].object as THREE.Mesh).geometry.boundingBox!.getCenter(c);
        for (const l of lod.levels) (l.object as THREE.Mesh).position.set(-c.x, -c.y, -c.z);
        lod.position.copy(c);
        lod.raycast = noRaycast;
        group.add(lod);
      }
    return group;
  }, []);
  useEffect(
    () => () =>
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      }),
    [root],
  );
  return <primitive object={root} />;
}

// ---- The lakes -------------------------------------------------------------------------------------

function rippleTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  // A normal map from a few overlapping wave trains (so it tiles).
  const waves = [
    [1, 2, 0.6],
    [3, -1, 0.35],
    [-2, 3, 0.25],
    [5, 4, 0.12],
    [-6, 1, 0.1],
  ];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const [kx, ky, a] of waves) {
        const ph = ((x * kx + y * ky) / size) * Math.PI * 2;
        dx += Math.cos(ph) * kx * a;
        dy += Math.cos(ph) * ky * a;
      }
      const o = (y * size + x) * 4;
      img.data[o] = 128 + dx * 9;
      img.data[o + 1] = 128 + dy * 9;
      img.data[o + 2] = 255;
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function Lakes() {
  const waters = golfWaters();
  const { material, normal } = useMemo(() => {
    const normal = rippleTexture();
    normal.repeat.set(0.05, 0.05);
    const material = new THREE.MeshPhysicalMaterial({
      color: "#2c5f66",
      roughness: 0.06,
      metalness: 0.05,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      transparent: true,
      opacity: 0.93,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.6,
    });
    material.userData.keepLook = true;
    return { material, normal };
  }, []);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    normal.offset.set(t * 0.004, t * 0.0027);
  });
  const big = waters.reduce((a, b) => (a.rx * a.rz > b.rx * b.rz ? a : b));
  return (
    <group>
      {waters.map((w, i) => (
        <mesh key={i} position={[w.x, w.level, w.z]} rotation-y={w.turn} receiveShadow raycast={noRaycast} material={material}>
          {/* World-sized UVs (so the ripples are the same size on every lake). */}
          <primitive object={lakeGeometry(w.rx * 1.06, w.rz * 1.06)} attach="geometry" />
        </mesh>
      ))}
      <Fountain x={big.x} y={big.level} z={big.z} />
      {/* Lily pads on the small ponds */}
      <LilyPads />
    </group>
  );
}

function lakeGeometry(rx: number, rz: number) {
  const g = new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2);
  g.scale(rx, 1, rz);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return g;
}

/** A fountain in the big lake: a tall jet with a falling veil, and rings spreading where it lands. */
function Fountain({ x, y, z }: { x: number; y: number; z: number }) {
  const jets = useRef<THREE.Group>(null);
  const spray = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.42, roughness: 0.2, depthWrite: false, emissive: "#c9e6ee", emissiveIntensity: 0.25 }), []);
  const ring = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e8f6f8", transparent: true, opacity: 0.5, depthWrite: false }), []);
  const rings = useRef<THREE.Mesh[]>([]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (jets.current) {
      jets.current.children.forEach((c, i) => {
        c.scale.y = 1 + Math.sin(t * 3 + i * 1.7) * 0.06;
      });
    }
    rings.current.forEach((r, i) => {
      if (!r) return;
      const k = (t * 0.35 + i / 3) % 1;
      r.scale.setScalar(3 + k * 9);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k);
    });
  });
  return (
    <group position={[x, y, z]}>
      <group ref={jets}>
        <mesh material={spray} position-y={7} raycast={noRaycast}>
          <cylinderGeometry args={[0.25, 0.6, 14, 12, 1, true]} />
        </mesh>
        <mesh material={spray} position-y={4.5} raycast={noRaycast}>
          <cylinderGeometry args={[0.8, 3.2, 9, 20, 1, true]} />
        </mesh>
        <mesh material={spray} position-y={1.6} raycast={noRaycast}>
          <cylinderGeometry args={[2.6, 4.4, 3.2, 24, 1, true]} />
        </mesh>
        <mesh material={spray} position-y={14} raycast={noRaycast}>
          <sphereGeometry args={[0.9, 12, 8]} />
        </mesh>
      </group>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) rings.current[i] = m;
          }}
          rotation-x={-Math.PI / 2}
          position-y={0.04}
          material={ring.clone()}
          raycast={noRaycast}
        >
          <ringGeometry args={[0.92, 1, 48]} />
        </mesh>
      ))}
    </group>
  );
}

function LilyPads() {
  const pads = useMemo(() => {
    const out: { x: number; y: number; z: number; s: number; r: number; flower: boolean }[] = [];
    let n = 99;
    const rnd = () => (n = (n * 16807) % 2147483647) / 2147483647;
    for (const w of golfWaters()) {
      if (w.rx * w.rz > 4000) continue;
      for (let k = 0; k < 26; k++) {
        const a = rnd() * Math.PI * 2;
        const r = 0.72 + rnd() * 0.22;
        const u = Math.cos(a) * w.rx * r;
        const v = Math.sin(a) * w.rz * r;
        const c = Math.cos(w.turn);
        const s = Math.sin(w.turn);
        out.push({ x: w.x + u * c + v * s, y: w.level + 0.03, z: w.z - u * s + v * c, s: 0.5 + rnd() * 0.6, r: rnd() * 6, flower: rnd() < 0.25 });
      }
    }
    return out;
  }, []);
  const padM = mat("#3f6b2c", 0.6);
  const flowerM = mat("#f3c6d8", 0.5);
  return (
    <group>
      {pads.map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]} rotation-y={p.r}>
          <mesh rotation-x={-Math.PI / 2} material={padM} scale={p.s} raycast={noRaycast}>
            <circleGeometry args={[1, 14, 0.4, Math.PI * 2 - 0.4]} />
          </mesh>
          {p.flower && (
            <mesh material={flowerM} position-y={0.12} scale={[0.28, 0.16, 0.28]} raycast={noRaycast}>
              <sphereGeometry args={[1, 8, 6]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

// ---- Flags and cups -------------------------------------------------------------------------------

function flagTexture(n: string, bg: string, fg: string) {
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 110;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 160, 110);
  g.fillStyle = fg;
  g.font = `800 78px ${fontFamily("display")}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(n, 80, 60);
  return canvasTexture(c);
}

type FlagSpot = { x: number; z: number; label: string; bg: string; fg: string };

function Flags() {
  const spots: FlagSpot[] = useMemo(
    () => HOLES.map((h) => ({ x: h.pin.x, z: h.pin.z, label: String(h.n), bg: h.n === 9 ? "#c9a227" : "#e5322d", fg: "#ffffff" })),
    [],
  );
  return <FlagSet spots={spots} />;
}

/** Flags on their poles (the cloth flaps in the wind), and the cups under them. */
export function FlagSet({ spots, height = 4.4 }: { spots: FlagSpot[]; height?: number }) {
  const cloths = useRef<THREE.Mesh[]>([]);
  const base = useMemo(() => new THREE.PlaneGeometry(1.25, 0.82, 12, 4).translate(0.625, 0, 0), []);
  const geos = useMemo(() => spots.map(() => base.clone()), [base, spots]);
  const mats = useMemo(() => spots.map((s) => new THREE.MeshStandardMaterial({ map: flagTexture(s.label, s.bg, s.fg), side: THREE.DoubleSide, roughness: 0.8 })), [spots]);
  const pole = mat("#f4f2ea", 0.4, 0.1);
  const cup = mat("#141414", 0.9);
  const liner = mat("#ffffff", 0.5);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const wa = Math.atan2(golf.wind.x || 0.3, golf.wind.z || 0.4);
    const strength = Math.min(1, Math.hypot(golf.wind.x, golf.wind.z) / 5 + 0.25);
    cloths.current.forEach((m, k) => {
      if (!m) return;
      const p = m.geometry.attributes.position as THREE.BufferAttribute;
      const src = base.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = src.getX(i);
        p.setZ(i, Math.sin(t * 7 - x * 5 + k) * 0.11 * x * strength + Math.sin(t * 3.1 + x * 2) * 0.03 * x);
        p.setY(i, src.getY(i) - x * x * 0.08 * (1 - strength));
      }
      p.needsUpdate = true;
      m.geometry.computeVertexNormals();
      m.parent!.rotation.y = wa - Math.PI / 2 + Math.sin(t * 0.7 + k) * 0.15;
    });
  });
  return (
    <group>
      {spots.map((s, i) => {
        const y = golfHeight(s.x, s.z);
        return (
          <group key={i} position={[s.x, y, s.z]}>
            <mesh rotation-x={-Math.PI / 2} position-y={0.012} material={liner} raycast={noRaycast}>
              <ringGeometry args={[0.15, 0.2, 24]} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position-y={0.014} material={cup} raycast={noRaycast}>
              <circleGeometry args={[0.16, 24]} />
            </mesh>
            <mesh material={pole} position-y={height / 2} castShadow raycast={noRaycast}>
              <cylinderGeometry args={[0.035, 0.035, height, 8]} />
            </mesh>
            <group position-y={height - 0.45}>
              <mesh
                ref={(m) => {
                  if (m) cloths.current[i] = m;
                }}
                geometry={geos[i]}
                material={mats[i]}
                castShadow
                raycast={noRaycast}
              />
            </group>
          </group>
        );
      })}
    </group>
  );
}

function PracticeGreen() {
  const p = CLUB.practice;
  const spots = useMemo<FlagSpot[]>(
    () =>
      [
        [-8, -5],
        [6, 7],
        [9, -6],
      ].map(([dx, dz], i) => ({ x: p.x + dx, z: p.z + dz, label: String(i + 1), bg: "#ffd23f", fg: "#1d3b2a" })),
    [p.x, p.z],
  );
  return <FlagSet spots={spots} height={2.4} />;
}

// ---- Trees and houses -------------------------------------------------------------------------------

function CourseTrees() {
  const { broad, spruce } = useMemo(() => {
    const broad: TreeSpot[] = [];
    const spruce: TreeSpot[] = [];
    for (const t of TREES) (t.kind === 0 ? broad : spruce).push({ x: t.x, z: t.z, s: t.s * 1.25, y: golfHeight(t.x, t.z) - 0.1 });
    return { broad, spruce };
  }, []);
  return (
    <group>
      <BroadleafTrees list={broad} />
      <SpruceTrees list={spruce} />
    </group>
  );
}

function Houses() {
  return (
    <group>
      {HOUSE_LOTS.map((l, i) => (
        <Near key={i} x={l.x} z={l.z} dist={620}>
          <group position={[l.x, golfHeight(l.x, l.z), l.z]} rotation-y={l.turn}>
            <Villa spec={{ w: l.w, d: l.d, seed: l.seed }} />
          </group>
        </Near>
      ))}
    </group>
  );
}

// ---- Your ball, the tracer and the aim ring ----------------------------------------------------------

const MAX_TRACE = 1000;

function BallAndTracer() {
  const ball = useRef<THREE.Mesh>(null);
  const beacon = useRef<THREE.Group>(null);
  const trace = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const endMark = useRef<THREE.Mesh>(null);
  const dots = useRef<THREE.InstancedMesh>(null);
  const traceGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_TRACE * 2 * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_TRACE * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < MAX_TRACE - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const traceMat = useMemo(
    () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [],
  );
  const v = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3(), side: new THREE.Vector3(), cam: new THREE.Vector3(), m: new THREE.Object3D() }), []);
  useFrame(({ camera }) => {
    const on = golf.mode !== "off";
    const b = golf.shot && (golf.shot.phase === "air" || golf.shot.phase === "roll" || golf.stage === "flight") ? golf.shot : golf.ball;
    if (ball.current) {
      ball.current.visible = on && golf.stage !== "holed";
      ball.current.position.set(b.x, b.y + 0.065, b.z);
    }
    if (beacon.current) {
      const far = Math.hypot(camera.position.x - golf.ball.x, camera.position.z - golf.ball.z);
      beacon.current.visible = on && golf.mode === "round" && golf.stage === "walk" && far > 8;
      beacon.current.position.set(golf.ball.x, golf.ball.y, golf.ball.z);
      beacon.current.scale.set(1 + far * 0.012, 1, 1 + far * 0.012);
    }
    // The tracer: a ribbon facing the camera, hot at the ball and cooling toward the start.
    const pts = golf.tracer;
    const n = on ? Math.min(pts.length, MAX_TRACE) : 0;
    const pos = traceGeo.attributes.position as THREE.BufferAttribute;
    const col = traceGeo.attributes.color as THREE.BufferAttribute;
    v.cam.copy(camera.position);
    for (let i = 0; i < n; i++) {
      const p = pts[pts.length - n + i];
      const q = pts[Math.min(pts.length - 1, pts.length - n + i + 1)];
      const o = pts[Math.max(0, pts.length - n + i - 1)];
      v.a.set(p.x, p.y, p.z);
      v.d.set(q.x - o.x, q.y - o.y, q.z - o.z);
      if (v.d.lengthSq() < 1e-6) v.d.set(0, 0, 1);
      v.b.copy(v.cam).sub(v.a);
      const dist = v.b.length();
      v.side.crossVectors(v.d, v.b).normalize();
      const w = 0.06 + dist * 0.0032;
      pos.setXYZ(i * 2, v.a.x + v.side.x * w, v.a.y + v.side.y * w, v.a.z + v.side.z * w);
      pos.setXYZ(i * 2 + 1, v.a.x - v.side.x * w, v.a.y - v.side.y * w, v.a.z - v.side.z * w);
      const k = n > 1 ? i / (n - 1) : 1;
      const r = 1;
      const g = 0.25 + 0.55 * k;
      const bl = 0.1 + 0.3 * k;
      const f = 0.35 + 0.65 * k;
      col.setXYZ(i * 2, r * f, g * f, bl * f);
      col.setXYZ(i * 2 + 1, r * f, g * f, bl * f);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    traceGeo.setDrawRange(0, Math.max(0, (n - 1) * 6));
    traceGeo.computeBoundingSphere();
    if (trace.current) trace.current.visible = n > 1;

    // The aim: dots along the predicted flight, a ring where it carries to, a mark where it'll stop.
    const pv = golf.stage === "address" ? golf.preview : null;
    const D = dots.current;
    if (D) {
      const list = pv ? pv.pts : [];
      const count = Math.min(list.length, 160);
      for (let i = 0; i < count; i++) {
        const p = list[i];
        v.m.position.set(p.x, p.y + 0.06, p.z);
        const dist = v.m.position.distanceTo(camera.position);
        v.m.scale.setScalar(0.05 + dist * 0.0028);
        v.m.updateMatrix();
        D.setMatrixAt(i, v.m.matrix);
      }
      D.count = count;
      D.instanceMatrix.needsUpdate = true;
      D.visible = count > 0;
    }
    if (ring.current) {
      const c = pv?.carry;
      ring.current.visible = Boolean(c);
      if (c) {
        ring.current.position.set(c.x, c.y + 0.12, c.z);
        const club = BAG[golf.club];
        ring.current.scale.setScalar(Math.max(1.6, club.carry * YARD * 0.035));
      }
    }
    if (endMark.current) {
      endMark.current.visible = Boolean(pv);
      if (pv) endMark.current.position.set(pv.end.x, pv.end.y + 0.1, pv.end.z);
    }
  });
  const white = mat("#fbfbf8", 0.35);
  return (
    <group>
      <mesh ref={ball} material={white} castShadow raycast={noRaycast}>
        <sphereGeometry args={[0.065, 16, 12]} />
      </mesh>
      <group ref={beacon} visible={false}>
        <mesh position-y={22} raycast={noRaycast}>
          <cylinderGeometry args={[0.35, 0.35, 44, 12, 1, true]} />
          <meshBasicMaterial color="#7ff3ff" transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={0.08} raycast={noRaycast}>
          <ringGeometry args={[0.7, 0.95, 32]} />
          <meshBasicMaterial color="#7ff3ff" transparent opacity={0.7} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={trace} geometry={traceGeo} material={traceMat} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={dots} args={[undefined, undefined, 160]} frustumCulled={false} raycast={noRaycast}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} toneMapped={false} />
      </instancedMesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <ringGeometry args={[0.86, 1, 48]} />
        <meshBasicMaterial color="#ffe066" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={endMark} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <circleGeometry args={[0.35, 20]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

