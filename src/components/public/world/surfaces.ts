import * as THREE from "three";
import { canvasTexture, seededRandom } from "./paint";

/*
 * Realistic ground: grass, asphalt and paving whose colour varies across
 * the world (patches of lighter and darker grass, worn and patched tarmac,
 * stained concrete slabs), worked out in the shader from where each pixel
 * is in the world, so the huge ground planes never look tiled. Plain
 * three.js materials (MeshStandardMaterial with a few lines added to its
 * shader); one of each, shared.
 */

const NOISE = /* glsl */ `
  varying vec3 vSurfWorld;
  float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), u.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float sFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * sNoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;

function withWorldPos(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSurfWorld;").replace(
    "#include <project_vertex>",
    `#include <project_vertex>
    vec4 surfP = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      surfP = instanceMatrix * surfP;
    #endif
    vSurfWorld = (modelMatrix * surfP).xyz;`,
  );
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${NOISE}`);
}

/** A tileable texture of fine speckle (grass blades, grit), drawn once. */
function speckle(seed: number, base: string, dots: [string, number][], size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const rand = seededRandom(seed);
  for (const [color, n] of dots) {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 1 + rand() * 2;
      const h = 1 + rand() * 5;
      g.fillRect(x, y, w, h);
      // Wrap round the edges so it tiles.
      if (x + w > size) g.fillRect(x - size, y, w, h);
      if (y + h > size) g.fillRect(x, y - size, w, h);
    }
  }
  const t = canvasTexture(c, [1, 1]);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

let grass: THREE.MeshStandardMaterial | null = null;
/** Grass: blades up close, and big soft patches of lighter, darker and drier grass across the fields. */
export function grassMaterial() {
  if (grass) return grass;
  const detail = speckle(11, "#5f8f3e", [
    ["rgba(30,60,20,0.55)", 2600],
    ["rgba(140,180,80,0.45)", 2200],
    ["rgba(190,200,110,0.25)", 500],
  ]);
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.97 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detail };
    withWorldPos(shader);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D uDetail;").replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      {
        vec2 p = vSurfWorld.xz;
        vec3 d = texture2D(uDetail, p * 0.16).rgb;
        vec3 d2 = texture2D(uDetail, p * 0.031 + 0.37).rgb;
        float big = sFbm(p * 0.006);
        float mid = sFbm(p * 0.035 + 7.0);
        vec3 lush = vec3(0.21, 0.36, 0.13);
        vec3 bright = vec3(0.36, 0.52, 0.2);
        vec3 dry = vec3(0.52, 0.52, 0.27);
        vec3 col = mix(lush, bright, smoothstep(0.3, 0.75, big));
        col = mix(col, dry, smoothstep(0.62, 0.86, mid) * 0.55);
        diffuseColor.rgb = col * (0.55 + 0.9 * mix(d, d2, 0.35));
      }`,
    );
  };
  m.customProgramCacheKey = () => "grass-v2";
  grass = m;
  return m;
}

const asphalts = new Map<string, THREE.MeshStandardMaterial>();
/** Tarmac: a road texture (with its painted lines, or none), plus worn patches, repairs and oil stains across the world. */
export function asphaltMaterial(map?: THREE.Texture) {
  const key = map?.uuid ?? "plain";
  const hit = asphalts.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ map: map ?? null, color: map ? "#ffffff" : "#4b5057", roughness: 0.9 });
  m.onBeforeCompile = (shader) => {
    withWorldPos(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float surfLine = step(0.62, max(diffuseColor.r, diffuseColor.g));
        {
          vec2 p = vSurfWorld.xz;
          float grit = sNoise(p * 9.0) * 0.5 + sNoise(p * 23.0) * 0.5;
          float wear = smoothstep(0.55, 0.7, sFbm(p * 0.05));
          float stain = smoothstep(0.7, 0.85, sFbm(p * 0.22 + 3.0));
          vec3 tar = mix(vec3(0.16, 0.17, 0.18), vec3(0.24, 0.245, 0.25), grit);
          tar = mix(tar, vec3(0.1, 0.105, 0.11), wear * 0.7);
          tar *= 1.0 - stain * 0.35;
          // Keep the painted lines (a little worn).
          vec3 paint = diffuseColor.rgb * (0.82 + 0.18 * grit);
          diffuseColor.rgb = mix(tar, paint, surfLine * (0.75 + 0.25 * sNoise(p * 3.0)));
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.92, 0.62, smoothstep(0.7, 0.85, sFbm(vSurfWorld.xz * 0.22 + 3.0)));`,
      );
  };
  m.customProgramCacheKey = () => `asphalt-v2-${map ? "lines" : "plain"}`;
  asphalts.set(key, m);
  return m;
}

let paving: THREE.MeshStandardMaterial | null = null;
/** Concrete paving slabs (sidewalks, plazas): a joint every 2 units, each slab a slightly different shade. */
export function pavingMaterial() {
  if (paving) return paving;
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.88 });
  m.onBeforeCompile = (shader) => {
    withWorldPos(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      {
        vec2 p = vSurfWorld.xz / 2.0;
        vec2 cell = floor(p);
        vec2 f = fract(p);
        float joint = 1.0 - smoothstep(0.0, 0.035, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
        float shade = 0.9 + sHash(cell) * 0.1;
        float grit = sNoise(vSurfWorld.xz * 14.0);
        float dirt = sFbm(vSurfWorld.xz * 0.09);
        vec3 c = vec3(0.79, 0.77, 0.73) * shade * (0.92 + grit * 0.1) * (1.0 - smoothstep(0.55, 0.8, dirt) * 0.18);
        diffuseColor.rgb = mix(c, c * 0.62, joint);
      }`,
    );
  };
  m.customProgramCacheKey = () => "paving-v2";
  paving = m;
  return m;
}
