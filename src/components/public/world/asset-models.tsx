"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ASSETS, fitted, footprintAngle, splitTrees, useAsset } from "./assets";
import { clearOccluders, heightMapOf, setOccluders } from "./occluders";
import { airportSwap } from "./rooms";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { groundAt } from "./terrain";

/*
 * The downloaded models in the world (assets.ts loads them; until one has
 * loaded, or if it isn't there, nothing here draws and what was there
 * before stays):
 *
 *   - RevueltoBody: the Vanta Revuelto's body (CarModel uses it).
 *   - ElmAvenue: autumn elms down the Crescent Heights avenues, instanced.
 *   - TerminalLandmark: the second terminal at the airport, solid.
 */

// ---- The car ---------------------------------------------------------------------------------------

/** The Revuelto from the downloaded model, sized and turned like the game's own cars (nose toward -z). Null until it's loaded. */
export function RevueltoBody() {
  const scene = useAsset("revuelto");
  const obj = useMemo(() => (scene ? fitted(scene.clone(true), ASSETS.revuelto.fit) : null), [scene]);
  if (!obj) return null;
  return <primitive object={obj} />;
}

/** Has the Revuelto model loaded? (So CarModel can use it instead of the drawn supercar.) */
export const useRevuelto = () => Boolean(useAsset("revuelto"));

// ---- The elms --------------------------------------------------------------------------------------

/** Trees in squares this big share their instanced meshes (so whole squares off-screen are skipped). */
const CELL = 160;
/** Further than this, a square of trees isn't drawn at all. */
const DRAW = 650;

/**
 * Autumn elms at these spots (s = size). The 5 trees in the model are split
 * apart and handed out in turn; each tree's parts (trunk, leaves…) are each
 * one InstancedMesh per square of the map. Returns null (and draws nothing)
 * until the model's loaded, so the caller can keep its own trees till then.
 */
export function ElmAvenue({ spots }: { spots: { x: number; z: number; s: number }[] }) {
  const scene = useAsset("elms");
  const cells = useMemo(() => {
    if (!scene) return null;
    const kinds = splitTrees(scene);
    if (!kinds.length) return null;
    const target = ASSETS.elms.fit.size;
    // Sort the spots into squares.
    const bySquare = new Map<string, { x: number; z: number; s: number; i: number }[]>();
    spots.forEach((p, i) => {
      const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
      bySquare.set(key, [...(bySquare.get(key) ?? []), { ...p, i }]);
    });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const out: { group: THREE.Group; x: number; z: number }[] = [];
    for (const list of bySquare.values()) {
      const group = new THREE.Group();
      let cx = 0;
      let cz = 0;
      kinds.forEach((kind, k) => {
        const mine = list.filter((p) => p.i % kinds.length === k);
        if (!mine.length) return;
        const scale = target / Math.max(0.01, kind.height);
        for (const part of kind.parts) {
          const inst = new THREE.InstancedMesh(part.geometry, part.material, mine.length);
          mine.forEach((p, j) => {
            // Each tree turned its own way, so the avenue doesn't look copied and pasted.
            q.setFromAxisAngle(up, (p.i * 2.399) % (Math.PI * 2));
            const sc = scale * p.s;
            m.compose(new THREE.Vector3(p.x, groundAt(p.x, p.z), p.z), q, new THREE.Vector3(sc, sc, sc)).multiply(part.matrix);
            inst.setMatrixAt(j, m);
          });
          inst.instanceMatrix.needsUpdate = true;
          inst.castShadow = true;
          inst.receiveShadow = true;
          // Frustum culling for the whole square: three.js needs the instances' bounds for that.
          inst.computeBoundingSphere();
          inst.computeBoundingBox();
          inst.frustumCulled = true;
          group.add(inst);
        }
      });
      for (const p of list) {
        cx += p.x / list.length;
        cz += p.z / list.length;
      }
      out.push({ group, x: cx, z: cz });
    }
    return out;
  }, [scene, spots]);

  // Whole squares too far away: not drawn.
  const root = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (!cells) return;
    for (const c of cells) {
      const far = (camera.position.x - c.x) ** 2 + (camera.position.z - c.z) ** 2 > DRAW * DRAW;
      c.group.visible = !far;
    }
  });
  useEffect(
    () => () => {
      // (The geometry and materials belong to the loaded model, which stays loaded; only the instance buffers are ours.)
      cells?.forEach((c) => c.group.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose()));
    },
    [cells],
  );
  if (!cells) return null;
  return (
    <group ref={root}>
      {cells.map((c, i) => (
        <primitive key={i} object={c.group} />
      ))}
    </group>
  );
}

/** Have the elms loaded? */
export const useElms = () => Boolean(useAsset("elms"));

// ---- The airport terminal ---------------------------------------------------------------------------

/**
 * Where it stands: life size, north of the main road opposite the apron
 * (the only place at the airport big enough: it's about 313 wide and 296
 * deep), centred where the old terminal was, its drive-up ramps reaching
 * to the road. `south` is how far south its front comes (the road's
 * sidewalk ends at z = 46).
 */
export const TERMINAL2 = { x: -880, south: 45, turn: -Math.PI / 2 };
/** The tower's walls above this height (world units; the halls are lower) get the clean curtain wall. */
const TOWER_FROM = 31;

/**
 * A better look for the terminal's one baked texture: the windows (the dark,
 * bluish parts of the texture) become glossy glass that reflects the sky;
 * the concrete stays matte. And smooth shading over the model's lumpy
 * surfaces, keeping the real corners sharp.
 */
function dressTerminal(root: THREE.Object3D) {
  // The building's own square directions (it sits at an angle in its file): its walls face these, its roofs face up.
  const a = footprintAngle(root);
  const axes = [new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), new THREE.Vector3(0, 1, 0)];
  const SNAP = Math.cos((28 * Math.PI) / 180);
  const n = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // Smooth over the bumps (the model's surfaces are crinkly), keeping real corners (over 70°) sharp...
    m.geometry = toCreasedNormals(m.geometry, (70 * Math.PI) / 180);
    // ...and flat walls and roofs shaded truly flat: a surface facing within 28° of a wall's or roof's direction faces exactly that way.
    const normals = m.geometry.attributes.normal;
    const toLocal = new THREE.Matrix3().getNormalMatrix(m.matrixWorld).invert();
    const local = axes.map((v) => v.clone().applyMatrix3(toLocal).normalize());
    for (let i = 0; i < normals.count; i++) {
      n.fromBufferAttribute(normals, i);
      for (const ax of local) {
        const d = n.dot(ax);
        if (Math.abs(d) > SNAP) {
          n.copy(ax).multiplyScalar(Math.sign(d));
          normals.setXYZ(i, n.x, n.y, n.z);
          break;
        }
      }
    }
    normals.needsUpdate = true;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const glassy = mat.clone();
    glassy.roughness = 0.82;
    glassy.metalness = 0;
    glassy.envMapIntensity = 1.1;
    if (glassy.map) glassy.map.anisotropy = 16;
    glassy.userData.keepLook = true;
    glassy.onBeforeCompile = (shader) => {
      shader.uniforms.towerFrom = { value: TOWER_FROM };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;")
        .replace(
          "#include <worldpos_vertex>",
          `#include <worldpos_vertex>
          vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\nuniform float towerFrom;")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          // The windows in the texture (its dark, bluish parts): glass.
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          float blue = diffuseColor.b - max(diffuseColor.r, diffuseColor.g) * 0.94;
          float glass = clamp(smoothstep(0.0, 0.05, blue) * (1.0 - smoothstep(0.32, 0.62, lum)), 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.62, 0.72), glass);
          // The tower's walls, above the halls: a clean glass curtain wall instead of the texture (which has creases baked into it).
          vec3 wn = normalize(vWorldNormal);
          float facade = smoothstep(towerFrom, towerFrom + 4.0, vWorldPos.y) * (1.0 - smoothstep(0.55, 0.8, abs(wn.y)));
          if (facade > 0.0) {
            // (The building's squared up with x and z: its walls run along one or the other.)
            float along = abs(wn.x) > abs(wn.z) ? vWorldPos.z : vWorldPos.x;
            float floorY = vWorldPos.y / 6.2;
            float bay = along / 3.4;
            float slab = step(fract(floorY), 0.13);
            float mullion = step(fract(bay), 0.07);
            float frame = max(slab, mullion);
            // Panes a little different from each other, like real glass.
            float h = fract(sin(dot(floor(vec2(bay, floorY)), vec2(12.9898, 78.233))) * 43758.5453);
            vec3 pane = mix(vec3(0.17, 0.24, 0.31), vec3(0.24, 0.32, 0.40), h);
            vec3 c = mix(pane, vec3(0.70, 0.72, 0.74), frame);
            diffuseColor.rgb = mix(diffuseColor.rgb, c, facade);
            glass = mix(glass, 1.0 - frame, facade);
          }`,
        )
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.12, glass);")
        .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.55, glass);")
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          // The tower's walls shaded perfectly flat (the glass reflects cleanly, with no creases).
          if (facade > 0.0) {
            vec3 flatN = abs(wn.x) > abs(wn.z) ? vec3(sign(wn.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(wn.z));
            normal = normalize(mix(normal, normalize((viewMatrix * vec4(flatN, 0.0)).xyz), facade));
          }`,
        );
    };
    glassy.customProgramCacheKey = () => "terminal-glass-5";
    glassy.needsUpdate = true;
    m.material = glassy;
    m.castShadow = true;
    // (Not shadowed by itself: its slightly bumpy surfaces would shade themselves in creases.)
    m.receiveShadow = false;
  });
}

export function TerminalLandmark() {
  const scene = useAsset("terminal");
  const built = useMemo(() => {
    if (!scene) return null;
    const model = scene.clone(true);
    dressTerminal(model);
    const g = new THREE.Group();
    const fit = fitted(model, ASSETS.terminal.fit);
    fit.rotation.y = TERMINAL2.turn;
    g.add(fit);
    // Front edge on the road's sidewalk, centred on the old terminal.
    g.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(g);
    g.position.set(TERMINAL2.x - (box.min.x + box.max.x) / 2, groundAt(TERMINAL2.x, TERMINAL2.south - 100) - box.min.y, TERMINAL2.south - box.max.z);
    g.updateWorldMatrix(true, true);
    // Its solid columns and floors (walls and the tower solid, canopies clear underneath, the forecourt walkable).
    const solid = heightMapOf(g, 4);
    return { g, solid };
  }, [scene]);
  useEffect(() => {
    if (!built) return;
    setOccluders("terminal", built.solid.boxes, built.solid.floor);
    airportSwap.terminal = true;
    return () => {
      clearOccluders("terminal");
      airportSwap.terminal = false;
    };
  }, [built]);
  if (!built) return null;
  return <primitive object={built.g} />;
}

/** Is the downloaded terminal standing in for the old terminal and control tower? (airport.tsx and rooms.ts ask.) */
export const useTerminalSwap = () => Boolean(useAsset("terminal"));
