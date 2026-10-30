"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { realShader } from "./realism";
import { surface } from "./detail";
import { seededRandom, noRaycast } from "./paint";
import { Instances, type Place } from "./town";
import { HILLS_START, groundAt } from "./terrain";
import { DRIVEWAY, inStoreBlock, onPavement, townObstaclesNear } from "./town-layout";
import { inCity } from "./city-plan";
import { PARK } from "./city-layout";
import { HOMES } from "./houses-layout";
import { AIRPORT, ESTATES, JAIL } from "./world-map";

/*
 * Nature, done properly. Plain three.js plus a few components.
 *
 *   - Foliage: leaves and needles that move in the wind (the whole crown
 *     sways, every leaf flutters), with clusters of leaves picked out in
 *     light and shade, a little light glowing through, and ragged, leafy
 *     edges instead of smooth balls.
 *   - Trees: broadleaf trees with a full, irregular crown of clumps, real
 *     bark on the trunk and branches reaching up into the leaves; spruces
 *     with layers of drooping, uneven boughs.
 *   - Bushes shaped the same way.
 *   - Grass: thousands of real blades round wherever you are, with
 *     wildflowers among them, swaying in the wind (they fade out further
 *     away, where the ground's own grass takes over).
 */

/** The wind's clock (seconds), shared by every swaying thing. */
export const wind = { value: 0 };

/** Keeps the wind blowing (put one in the scene). */
export function NatureClock() {
  useFrame((state) => {
    wind.value = state.clock.elapsedTime;
  });
  return null;
}

// ---- Foliage ----------------------------------------------------------------------------------

type Kind = "leaf" | "needle" | "bush";
const KINDS: Record<Kind, { freq: number; sway: number; edge: number }> = {
  leaf: { freq: 3.8, sway: 0.07, edge: 0.46 },
  needle: { freq: 6.5, sway: 0.045, edge: 0.52 },
  bush: { freq: 4.8, sway: 0.03, edge: 0.48 },
};

function foliagePatch(kind: Kind) {
  const k = KINDS[kind];
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    realShader(shader, "plain");
    shader.uniforms.wind = wind;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float wind;\nvarying vec3 vDetN2;").replace(
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>
      {
        vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
          wn = mat3(instanceMatrix) * wn;
        #endif
        vDetN2 = mat3(modelMatrix) * wn;
      }`,
    ).replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      {
        // The whole crown sways together (each tree at its own moment), and every leaf flutters.
        vec4 root = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          root = instanceMatrix * root;
        #endif
        root = modelMatrix * root;
        float ph = wind * 1.3 + root.x * 0.11 + root.z * 0.07;
        float sway = sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.25;
        float flutter = sin(wind * 7.0 + position.x * 9.0 + position.y * 7.0 + position.z * 8.0) * 0.015;
        float up = clamp(position.y * 0.5 + 0.5, 0.0, 1.0);
        transformed.x += (sway * ${k.sway.toFixed(3)} + flutter) * up;
        transformed.z += (sway * ${(k.sway * 0.6).toFixed(3)} + flutter) * up;
      }`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace("varying vec3 vRealWorld;", "varying vec3 vRealWorld;\nvarying vec3 vDetN2;\nfloat leafN = 0.5;\nfloat leafH = 0.0;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          // Clusters of leaves: bright where they face out, dark gaps between; sun on the brightest tips.
          vec3 lp = vRealWorld * ${k.freq.toFixed(2)};
          float n1 = rNoise(lp);
          float n2 = rNoise(lp * 2.7 + 13.1);
          leafN = n1 * 0.55 + n2 * 0.45;
          float near = 1.0 - smoothstep(0.6, 1.6, length(fwidth(lp)));
          float leaf = smoothstep(0.3, 0.62, leafN);
          // Deeper in the crown (lower, facing down) is in shade.
          float under = smoothstep(0.2, -0.6, normalize(vDetN2).y);
          diffuseColor.rgb *= mix(0.88, mix(0.5, 1.12, leaf), near) * (1.0 - 0.35 * under);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.14, 0.78), smoothstep(0.72, 0.95, n2) * 0.5);
          leafH = leaf * near;
        }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 dpdx = dFdx(-vViewPosition);
          vec3 dpdy = dFdy(-vViewPosition);
          float hx = dFdx(leafH);
          float hy = dFdy(leafH);
          vec3 r1 = cross(dpdy, normal);
          vec3 r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          normal = normalize(abs(det) * normal - 0.05 * sign(det) * (hx * r1 + hy * r2));
          // Ragged, leafy edges: round the outline, the gaps between leaves let the sky through.
          float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
          if (rim > ${k.edge.toFixed(2)} && leafN < (rim - ${k.edge.toFixed(2)}) * 2.4) discard;
        }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        // A little light glowing through the leaves.
        "#include <emissivemap_fragment>\n        totalEmissiveRadiance += diffuseColor.rgb * 0.07;",
      );
  };
}
const PATCHES: Record<Kind, ReturnType<typeof foliagePatch>> = { leaf: foliagePatch("leaf"), needle: foliagePatch("needle"), bush: foliagePatch("bush") };

const foliageCache = new Map<string, THREE.MeshStandardMaterial>();
/** Leaves, needles or a bush (white lets each instance's own green through). */
export function foliage(kind: Kind, color = "#ffffff") {
  const key = `${kind}|${color}`;
  let m = foliageCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, side: THREE.FrontSide });
    m.onBeforeCompile = PATCHES[kind];
    m.customProgramCacheKey = () => `foliage-${kind}-1`;
    foliageCache.set(key, m);
  }
  return m;
}

/** Real bark (deep furrows), for every trunk and branch. */
export const barkMaterial = () => surface("bark", "#4e3b2c", 0.95);

// ---- Shapes -------------------------------------------------------------------------------------

/** A lumpy clump of leaves: a ball pushed in and out at a few sizes, a bit flatter underneath. */
function clumpGeometry(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n1 = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 - seed) * Math.sin(v.z * 3.7 + seed * 2);
    const n2 = Math.sin(v.x * 7.3 - seed * 3) * Math.sin(v.y * 6.1 + seed) * Math.cos(v.z * 8.2 + seed);
    v.multiplyScalar(1 + n1 * 0.18 + n2 * 0.07);
    p.setXYZ(i, v.x, v.y * (v.y < 0 ? 0.72 : 0.95), v.z);
  }
  g.computeVertexNormals();
  return g;
}
export const CLUMPS = [clumpGeometry(1), clumpGeometry(2.3), clumpGeometry(3.7), clumpGeometry(5.1)];

/** One layer of a spruce: a ring of boughs, drooping at the tips and uneven round the edge. */
function boughGeometry(seed: number) {
  const g = new THREE.ConeGeometry(1, 1, 18, 5, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const out = 1 + 0.22 * Math.sin(a * 7 + seed) * (0.5 - y) + 0.1 * Math.sin(a * 13 - seed * 2) * (0.5 - y);
    // The tips hang down a little.
    const droop = r > 0.75 ? -0.18 * (r - 0.75) * 4 : 0;
    p.setXYZ(i, x * out, y + droop + 0.06 * Math.sin(a * 5 + seed) * (0.5 - y), z * out);
  }
  g.computeVertexNormals();
  return g;
}
export const BOUGHS = [boughGeometry(0.5), boughGeometry(2.1), boughGeometry(3.9)];
const TRUNK = new THREE.CylinderGeometry(0.22, 0.42, 1, 10, 1);
const BRANCH = new THREE.CylinderGeometry(0.06, 0.14, 1, 6, 1).translate(0, 0.5, 0);

// ---- Broadleaf trees ----------------------------------------------------------------------------

export type TreeSpot = { x: number; z: number; s: number; y?: number };
const GREENS = ["#4a7a35", "#55853a", "#3f6e2f", "#5f8d40", "#4d7232", "#6b8f3e"];
/** The crown: clumps round a tree's top (x, height, z, size), set a little differently on every tree. */
const CROWN: [number, number, number, number][] = [
  [0, 5.6, 0, 2.5],
  [1.5, 5.0, 0.6, 1.8],
  [-1.4, 5.2, -0.5, 1.9],
  [0.5, 6.9, -0.4, 1.8],
  [-0.6, 6.4, 1.2, 1.6],
  [0.9, 4.6, -1.3, 1.5],
];
/** Branches from the top of the trunk up into the clumps. */
const BRANCHES: [number, number, number][] = [
  [1.4, 0.6, 0.6],
  [-1.3, 0.6, -0.5],
  [0.4, -0.4, 1.1],
];

/** A forest of broadleaf trees (or one park's worth): trunks in bark, branches, and full crowns of swaying leaves. */
export function BroadleafTrees({ list, shadows = true }: { list: TreeSpot[]; shadows?: boolean }) {
  const placers = useMemo(() => {
    const rot = (t: TreeSpot, i: number) => i * 1.7 + t.x * 0.13;
    const trunk: Place = (i, o) => {
      const t = list[i];
      o.position.set(t.x, (t.y ?? 0) + 2.3 * t.s, t.z);
      o.scale.set(t.s, 4.6 * t.s, t.s);
    };
    const branch =
      (b: number): Place =>
      (i, o) => {
        const t = list[i];
        const [bx, ry, bz] = BRANCHES[b];
        const a = rot(t, i);
        o.position.set(t.x, (t.y ?? 0) + 3.9 * t.s, t.z);
        o.rotation.set(0, a + ry, Math.atan2(Math.hypot(bx, bz), 2.2) * Math.sign(bx || 1), "YXZ");
        o.scale.set(t.s, 2.4 * t.s, t.s);
      };
    const clump =
      (c: number): Place =>
      (i, o) => {
        const t = list[i];
        const [cx, cy, cz, r] = CROWN[c];
        const a = rot(t, i);
        // Every tree's crown a little different: some clumps bigger, some higher.
        const jit = 0.85 + ((i * 7 + c * 13) % 9) / 30;
        o.position.set(t.x + (cx * Math.cos(a) - cz * Math.sin(a)) * t.s, (t.y ?? 0) + cy * t.s * (0.95 + ((i + c) % 5) * 0.025), t.z + (cx * Math.sin(a) + cz * Math.cos(a)) * t.s);
        o.rotation.set(0, a + c, 0);
        o.scale.setScalar(r * t.s * jit);
        return GREENS[(i * 3 + c) % GREENS.length];
      };
    return { trunk, branches: BRANCHES.map((_, b) => branch(b)), clumps: CROWN.map((_, c) => clump(c)) };
  }, [list]);
  const leaves = foliage("leaf");
  const bark = barkMaterial();
  return (
    <group>
      <Instances count={list.length} place={placers.trunk} geometry={TRUNK} castShadow={shadows}>
        <primitive object={bark} attach="material" />
      </Instances>
      {placers.branches.map((place, b) => (
        <Instances key={`b${b}`} count={list.length} place={place} geometry={BRANCH}>
          <primitive object={bark} attach="material" />
        </Instances>
      ))}
      {placers.clumps.map((place, c) => (
        <Instances key={c} count={list.length} place={place} geometry={CLUMPS[c % CLUMPS.length]} castShadow={shadows}>
          <primitive object={leaves} attach="material" />
        </Instances>
      ))}
    </group>
  );
}

// ---- Spruces -------------------------------------------------------------------------------------

const SPRUCE_GREENS = ["#2e4f2c", "#355a31", "#29462a", "#3a5f34"];
/** Five layers of boughs, smaller toward the top. */
const LAYERS = [0, 1, 2, 3, 4];

/** Spruces: a bark trunk and five layers of drooping boughs. */
export function SpruceTrees({ list, shadows = true }: { list: TreeSpot[]; shadows?: boolean }) {
  const placers = useMemo(() => {
    const trunk: Place = (i, o) => {
      const t = list[i];
      o.position.set(t.x, (t.y ?? 0) + 2.6 * t.s, t.z);
      o.scale.set(t.s * 0.8, 5.2 * t.s, t.s * 0.8);
    };
    const layer =
      (k: number): Place =>
      (i, o) => {
        const t = list[i];
        const w = (3.1 - k * 0.55) * t.s;
        o.position.set(t.x, (t.y ?? 0) + (2.6 + k * 1.75) * t.s, t.z);
        o.rotation.y = i * 1.7 + k * 0.9;
        o.scale.set(w, (3.0 - k * 0.25) * t.s, w);
        return SPRUCE_GREENS[(i + k) % SPRUCE_GREENS.length];
      };
    return { trunk, layers: LAYERS.map(layer) };
  }, [list]);
  const needles = foliage("needle");
  const bark = barkMaterial();
  return (
    <group>
      <Instances count={list.length} place={placers.trunk} geometry={TRUNK} castShadow={shadows}>
        <primitive object={bark} attach="material" />
      </Instances>
      {placers.layers.map((place, k) => (
        <Instances key={k} count={list.length} place={place} geometry={BOUGHS[k % BOUGHS.length]} castShadow={shadows}>
          <primitive object={needles} attach="material" />
        </Instances>
      ))}
    </group>
  );
}

// ---- Bushes -------------------------------------------------------------------------------------

const BUSH_GREENS = ["#3f6b30", "#4a7838", "#365f2b", "#557f3c"];
/** Bushes: two or three overlapping clumps each, so they're not balls. */
export function Bushes({ list }: { list: { x: number; z: number; s: number }[] }) {
  const placers = useMemo(
    () =>
      [0, 1, 2].map(
        (k): Place =>
          (i, o) => {
            const b = list[i];
            const a = i * 2.1 + k * 2.2;
            const off = k === 0 ? 0 : 0.7 * b.s;
            o.position.set(b.x + Math.cos(a) * off, (0.75 - k * 0.12) * b.s, b.z + Math.sin(a) * off);
            o.rotation.y = a;
            o.scale.set((1.15 - k * 0.2) * b.s, (0.9 - k * 0.12) * b.s, (1.05 - k * 0.2) * b.s);
            return BUSH_GREENS[(i + k) % BUSH_GREENS.length];
          },
      ),
    [list],
  );
  const leaves = foliage("bush");
  return (
    <group>
      {placers.map((place, k) => (
        <Instances key={k} count={list.length} place={place} geometry={CLUMPS[(k + 1) % CLUMPS.length]} castShadow={k === 0}>
          <primitive object={leaves} attach="material" />
        </Instances>
      ))}
    </group>
  );
}

// ---- Grass --------------------------------------------------------------------------------------

/** Is there grass at (x, z)? (Not on roads, pavement, the lot, the city's paving, inside the airport, the jail or the gated estate, or under houses.) */
const grassCache = new Map<number, boolean>();
function grassAt(x: number, z: number) {
  const cx = Math.floor(x / 2);
  const cz = Math.floor(z / 2);
  const key = cx * 100003 + cz;
  const got = grassCache.get(key);
  if (got !== undefined) return got;
  const px = cx * 2 + 1;
  const pz = cz * 2 + 1;
  let ok = true;
  const inBox = (b: { minX: number; maxX: number; minZ: number; maxZ: number }) => px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ;
  const inPark = px > PARK.x0 + 3 && px < PARK.x1 - 3 && pz > PARK.z0 + 3 && pz < PARK.z1 - 3;
  if (pz < HILLS_START + 10 || inBox(AIRPORT) || inBox(ESTATES) || inBox(JAIL)) ok = false;
  else if (!inPark && inCity(px, pz, 4)) ok = false;
  else if (onPavement(px, pz, 1.2) || inStoreBlock(px, pz, 2)) ok = false;
  else if (Math.abs(px - DRIVEWAY.x) < DRIVEWAY.halfWidth + 2 && pz > DRIVEWAY.fromZ - 2 && pz < DRIVEWAY.toZ + 2) ok = false;
  else if (HOMES.some((h) => Math.hypot(h.site.x - px, h.site.z - pz) < Math.max(h.w, h.d) * 0.75 + 6)) ok = false;
  else {
    const near = townObstaclesNear(px, pz);
    if (near.boxes.some((b) => Math.abs(px - b.x) < b.hw + 1.5 + Math.abs(Math.sin(b.turn)) * b.hd && Math.abs(pz - b.z) < b.hd + 1.5 + Math.abs(Math.sin(b.turn)) * b.hw)) ok = false;
  }
  if (grassCache.size > 200000) grassCache.clear();
  grassCache.set(key, ok);
  return ok;
}

/** One blade of grass: a tapering strip, its base at 0 and its tip at 1. */
const BLADE = (() => {
  const levels = 5;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= levels; i++) {
    const y = i / levels;
    const w = 0.06 * (1 - y * 0.92);
    pos.push(-w, y, 0, w, y, 0);
    uv.push(0, y, 1, y);
    if (i < levels) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
})();
const FLOWER = new THREE.SphereGeometry(1, 8, 5);

/** How far round you the grass reaches, and the size of each square of it. */
const RADIUS = 42;
const CELL = 7;
const SPAN = Math.ceil((RADIUS * 2) / CELL) + 1;

function grassMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    realShader(shader, "plain");
    shader.uniforms.wind = wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float wind;\nvarying float vBladeY;")
      // Lit mostly from above, like a lawn (blades this thin would otherwise flicker light and dark).
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n      objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.75));")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vBladeY = position.y;
          vec4 root = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float y2 = position.y * position.y;
          // Each blade curves over a little, and the wind runs across the field in waves.
          float ph = wind * 1.8 + root.x * 0.18 + root.z * 0.12;
          float gust = sin(ph) * 0.5 + sin(ph * 0.37 + 2.0) * 0.5;
          transformed.z += y2 * (0.22 + gust * 0.28);
          transformed.x += y2 * sin(wind * 3.1 + root.x * 1.7 + root.z * 2.3) * 0.05;
          transformed.y -= y2 * abs(gust) * 0.08;
          // Fade out (shrink) toward the edge of the patch round you.
          float d = distance(root.xz, cameraPosition.xz);
          transformed *= 1.0 - smoothstep(${(RADIUS * 0.55).toFixed(1)}, ${(RADIUS * 0.92).toFixed(1)}, d);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vBladeY;").replace(
      "#include <color_fragment>",
      // Darker at the roots, lighter and a little yellow at the tips.
      "#include <color_fragment>\n        diffuseColor.rgb *= mix(0.38, 1.12, vBladeY);\n        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.08, 0.72), smoothstep(0.6, 1.0, vBladeY) * 0.5);",
    );
  };
  m.customProgramCacheKey = () => "grass-blades-1";
  return m;
}

const BLADE_GREENS = ["#4f7a33", "#5b8a3a", "#476f2e", "#68913f", "#7d9346", "#5e8236"].map((c) => new THREE.Color(c));
const FLOWER_COLORS = ["#f4f1e6", "#f2d14b", "#b48ad9", "#e8664f", "#f0f0ff", "#ffd27a"].map((c) => new THREE.Color(c));

/**
 * Real grass round you: square patches of blades (and a few wildflowers),
 * anchored to the world, so as you move the patches behind you are reused
 * for the ground ahead.
 */
export function GrassField({ perCell }: { perCell: number }) {
  const blades = useRef<THREE.InstancedMesh>(null);
  const flowers = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(grassMaterial, []);
  useEffect(() => () => material.dispose(), [material]);
  const slots = useMemo(() => new Array<number>(SPAN * SPAN).fill(Number.NaN), []);
  const FLOWERS = Math.max(1, Math.round(perCell / 30));
  const count = SPAN * SPAN * perCell;
  const fcount = SPAN * SPAN * FLOWERS;
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color() }), []);

  useFrame(({ camera }) => {
    const b = blades.current;
    const f = flowers.current;
    if (!b || !f) return;
    // Up in the air (the drone view, flying): no grass.
    const high = camera.position.y - groundAt(camera.position.x, camera.position.z) > 70;
    b.visible = f.visible = !high;
    if (high) return;
    const ccx = Math.floor(camera.position.x / CELL);
    const ccz = Math.floor(camera.position.z / CELL);
    const half = Math.floor(SPAN / 2);
    let changed = false;
    for (let i = -half; i <= half; i++)
      for (let j = -half; j <= half; j++) {
        const gx = ccx + i;
        const gz = ccz + j;
        const slot = (((gx % SPAN) + SPAN) % SPAN) * SPAN + (((gz % SPAN) + SPAN) % SPAN);
        const key = gx * 65536 + gz;
        if (slots[slot] === key) continue;
        slots[slot] = key;
        changed = true;
        fill(b, f, slot, gx, gz);
      }
    if (changed) {
      b.instanceMatrix.needsUpdate = true;
      f.instanceMatrix.needsUpdate = true;
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
      if (f.instanceColor) f.instanceColor.needsUpdate = true;
    }
  });

  /** Put the blades and flowers for the square (gx, gz) into this slot. */
  function fill(b: THREE.InstancedMesh, f: THREE.InstancedMesh, slot: number, gx: number, gz: number) {
    // (A positive seed for every square, wherever it is on the map.)
    const rand = seededRandom((((gx * 7919 + gz * 104729) % 2147483646) + 2147483646) % 2147483646 + 1);
    const { o, c } = tmp;
    for (let k = 0; k < perCell; k++) {
      const x = gx * CELL + rand() * CELL;
      const z = gz * CELL + rand() * CELL;
      const h = 0.45 + rand() * 0.55;
      const yaw = rand() * Math.PI * 2;
      const tint = rand();
      if (grassAt(x, z)) {
        o.position.set(x, groundAt(x, z), z);
        o.rotation.set(0, yaw, 0);
        o.scale.set(0.8 + tint * 0.5, h, 1);
      } else o.scale.setScalar(0);
      o.updateMatrix();
      b.setMatrixAt(slot * perCell + k, o.matrix);
      b.setColorAt(slot * perCell + k, c.copy(BLADE_GREENS[Math.min(BLADE_GREENS.length - 1, Math.floor(tint * BLADE_GREENS.length))]));
    }
    for (let k = 0; k < FLOWERS; k++) {
      const x = gx * CELL + rand() * CELL;
      const z = gz * CELL + rand() * CELL;
      const col = Math.min(FLOWER_COLORS.length - 1, Math.floor(rand() * FLOWER_COLORS.length));
      if (grassAt(x, z) && rand() < 0.7) {
        o.position.set(x, groundAt(x, z) + 0.5 + rand() * 0.25, z);
        o.rotation.set(0, 0, 0);
        o.scale.set(0.09, 0.035, 0.09);
      } else o.scale.setScalar(0);
      o.updateMatrix();
      f.setMatrixAt(slot * FLOWERS + k, o.matrix);
      f.setColorAt(slot * FLOWERS + k, c.copy(FLOWER_COLORS[col]));
    }
  }

  return (
    <group>
      <instancedMesh ref={blades} args={[BLADE, material, count]} frustumCulled={false} receiveShadow raycast={noRaycast} />
      <instancedMesh ref={flowers} args={[FLOWER, undefined, fcount]} frustumCulled={false} raycast={noRaycast}>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    </group>
  );
}
