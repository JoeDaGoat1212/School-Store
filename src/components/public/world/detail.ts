import * as THREE from "three";
import { realShader, realism } from "./realism";

/*
 * Real building surfaces, for everything that was a plain painted box: brick
 * with recessed mortar, lap siding, roof shingles, cut stone, stucco, metal
 * panels, deck planks and board-formed concrete. The bank is built from
 * hand-drawn stone textures; this does the same job for the hundreds of
 * houses, towers and shops, which are instanced boxes of every size: the
 * pattern is worked out in the shader from where each pixel is in the world
 * (so a brick is the same size on a garden wall and a skyscraper), and the
 * surface is given real depth (the light catches the edge of each brick,
 * board and shingle; the mortar sits back in shadow).
 *
 * Each material keeps the colour it's given (or each instance's own
 * colour), adds real-world colour and weathering (realism.ts), and, far
 * away, fades the pattern to an even colour so it doesn't shimmer.
 */

export type Surface = "brick" | "siding" | "shingle" | "stone" | "stucco" | "panel" | "planks" | "concrete";

const COMMON = /* glsl */ `
  varying vec3 vDetN;
  float detH = 0.0;
  float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float dNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x), mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // Where on the surface we are: along the wall and up it (walls of any direction), or across the ground (tops).
  vec2 detUV() {
    vec3 n = normalize(vDetN);
    if (abs(n.y) > 0.75) return vRealWorld.xz;
    vec2 t = normalize(vec2(-n.z, n.x) + vec2(1e-5, 0.0));
    return vec2(dot(vRealWorld.xz, t), vRealWorld.y);
  }
  // Bump the surface by a height worked out per pixel (no texture needed).
  vec3 detBump(vec3 nrm, float h, float k) {
    vec3 dpdx = dFdx(-vViewPosition);
    vec3 dpdy = dFdy(-vViewPosition);
    float hx = dFdx(h);
    float hy = dFdy(h);
    vec3 r1 = cross(dpdy, nrm);
    vec3 r2 = cross(nrm, dpdx);
    float det = dot(dpdx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    return normalize(abs(det) * nrm - k * grad);
  }
  // Bricks, blocks, panels: a running-bond grid. Returns (inside the unit 0…1, jitter 0…1); "edge" is how far from a joint, in world units.
  vec2 bond(vec2 uv, vec2 size, float stagger, out float edge, out vec2 cell) {
    vec2 b = uv / size;
    float row = floor(b.y);
    b.x += mod(row, 2.0) * stagger;
    cell = floor(b);
    vec2 f = fract(b);
    edge = min(min(f.x, 1.0 - f.x) * size.x, min(f.y, 1.0 - f.y) * size.y);
    return vec2(dHash(cell), dHash(cell + 17.3));
  }
`;

/** The pattern for each surface: sets the colour (col, starting as the material's colour), detH (the height for the bump) and rough. */
const PATTERNS: Record<Surface, string> = {
  brick: `
    float e; vec2 c;
    vec2 j = bond(uv, vec2(0.84, 0.32), 0.5, e, c);
    float brick = smoothstep(0.035, 0.07, e);
    vec3 face = col * (0.8 + 0.34 * j.x) * (0.94 + 0.12 * dNoise(uv * 9.0));
    // A few darker, burnt bricks.
    face *= mix(1.0, 0.7, step(0.9, j.y));
    col = mix(vec3(0.62, 0.6, 0.56), face, brick);
    detH = brick * 0.7 + dNoise(uv * 14.0) * 0.08;
    rough = mix(0.97, rough, brick);
    scale = 0.84;`,
  siding: `
    float row = uv.y / 0.42;
    float f = fract(row);
    // Each board overlaps the one below it: a shadow line under each, lighter where the next board catches the sun.
    col *= mix(0.7, 1.0, smoothstep(0.0, 0.14, f)) * (0.97 + 0.06 * f);
    col *= 0.95 + 0.08 * dNoise(vec2(uv.x * 0.35, floor(row) * 3.7));
    // (A smooth profile, thick at the bottom edge: no sudden steps, so the light rolls over each board.)
    detH = smoothstep(0.0, 0.12, f) * smoothstep(1.0, 0.86, f) * (1.0 - 0.5 * f);
    scale = 0.42;`,
  shingle: `
    float e; vec2 c;
    vec2 j = bond(uv, vec2(0.95, 0.42), 0.5, e, c);
    float f = fract(uv.y / 0.42);
    col *= (0.78 + 0.32 * j.x) * (0.92 + 0.14 * dNoise(uv * 6.0));
    // The bottom edge of each row throws a shadow on the row below; thin gaps between shingles.
    col *= mix(0.62, 1.0, smoothstep(0.0, 0.18, f));
    float gap = smoothstep(0.03, 0.0, min(fract(uv.x / 0.95 + mod(c.y, 2.0) * 0.5), 1.0 - fract(uv.x / 0.95 + mod(c.y, 2.0) * 0.5)) * 0.95);
    col *= 1.0 - gap * 0.45;
    detH = smoothstep(0.0, 0.14, f) * smoothstep(1.0, 0.8, f) * (1.0 - 0.4 * f) - gap * 0.4;
    rough = 0.92;
    scale = 0.42;`,
  stone: `
    float e; vec2 c;
    vec2 j = bond(uv, vec2(2.2, 0.95), 0.5, e, c);
    float block = smoothstep(0.03, 0.09, e);
    vec3 face = col * (0.88 + 0.18 * j.x) * (0.9 + 0.2 * dNoise(uv * 3.0 + j * 9.0)) * (0.96 + 0.06 * dNoise(uv * 22.0));
    col = mix(col * 0.72, face, block);
    // A soft bevel on each block.
    detH = smoothstep(0.03, 0.22, e) * 0.9 + dNoise(uv * 18.0) * 0.06;
    scale = 0.95;`,
  stucco: `
    float n = dNoise(uv * 5.0) * 0.5 + dNoise(uv * 13.0) * 0.3 + dNoise(uv * 37.0) * 0.2;
    col *= 0.92 + 0.14 * n;
    detH = n * 0.25;
    scale = 0.2;`,
  panel: `
    float e; vec2 c;
    vec2 j = bond(uv, vec2(3.0, 1.5), 0.0, e, c);
    float p = smoothstep(0.02, 0.05, e);
    col *= mix(0.55, 0.96 + 0.08 * j.x, p);
    detH = p * 0.6;
    // Fixings at the corners.
    vec2 g = fract(uv / vec2(3.0, 1.5));
    float bolt = smoothstep(0.06, 0.03, length((g - vec2(0.04, 0.08)) * vec2(3.0, 1.5)));
    col *= 1.0 - bolt * 0.3;
    scale = 1.5;`,
  planks: `
    float row = uv.y / 0.5;
    float f = fract(row);
    float gap = smoothstep(0.06, 0.0, min(f, 1.0 - f));
    col *= (0.86 + 0.24 * dHash(vec2(floor(row), 3.0))) * (0.9 + 0.2 * dNoise(vec2(uv.x * 0.6, row * 9.0)));
    col *= 1.0 - gap * 0.55;
    detH = 1.0 - gap;
    scale = 0.5;`,
  concrete: `
    float e; vec2 c;
    vec2 j = bond(uv, vec2(2.4, 1.2), 0.0, e, c);
    float seam = smoothstep(0.0, 0.03, e);
    vec2 g = fract(uv / vec2(2.4, 1.2));
    float tie = 0.0;
    for (int k = 0; k < 4; k++) {
      vec2 at = vec2(k < 2 ? 0.2 : 0.8, mod(float(k), 2.0) < 1.0 ? 0.25 : 0.75);
      tie = max(tie, smoothstep(0.05, 0.03, length((g - at) * vec2(2.4, 1.2))));
    }
    col *= (0.92 + 0.1 * j.x) * (0.9 + 0.18 * dNoise(uv * 4.0)) * mix(0.82, 1.0, seam) * (1.0 - tie * 0.35);
    detH = seam * 0.3 - tie * 0.5 + dNoise(uv * 20.0) * 0.05;
    scale = 1.2;`,
};

/** How strongly each surface is bumped. */
const BUMP: Record<Surface, number> = { brick: 0.05, siding: 0.06, shingle: 0.07, stone: 0.07, stucco: 0.03, panel: 0.03, planks: 0.04, concrete: 0.03 };

function patch(surface: Surface) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    // Real-world colour and weathering first (that also gives us vRealWorld, the world position).
    realShader(shader, "plain");
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vDetN;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      {
        vec3 detN = objectNormal;
        #ifdef USE_INSTANCING
          detN = mat3(instanceMatrix) * detN;
        #endif
        vDetN = normalize(mat3(modelMatrix) * detN);
      }`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace("varying vec3 vRealWorld;", `varying vec3 vRealWorld;\n${COMMON}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          vec2 uv = detUV();
          vec3 col = diffuseColor.rgb;
          float rough = roughness;
          float scale = 1.0;
          ${PATTERNS[surface]}
          // Far away (the pattern smaller than a pixel or two): an even colour, no bump, no shimmer.
          float far = smoothstep(0.35, 1.0, length(fwidth(uv)) / scale);
          diffuseColor.rgb = mix(col, diffuseColor.rgb * 0.92, far);
          detH *= 1.0 - far;
          detRough = mix(rough, roughness, far);
        }`,
      )
      .replace("float detH = 0.0;", "float detH = 0.0;\n  float detRough = 1.0;")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n        roughnessFactor = detRough;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n        normal = detBump(normal, detH, ${BUMP[surface].toFixed(3)});`);
  };
}

const PATCHES = Object.fromEntries((Object.keys(PATTERNS) as Surface[]).map((s) => [s, patch(s)])) as Record<Surface, ReturnType<typeof patch>>;

/** Turn a material into one of the real surfaces (its colour stays; instance colours still work). */
export function detailed(m: THREE.MeshStandardMaterial, surface: Surface) {
  m.onBeforeCompile = PATCHES[surface];
  const lite = realism.lite;
  m.customProgramCacheKey = () => `detail-${surface}-${lite ? "lite" : "full"}-1`;
  return m;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();
/** A shared material of one surface (and colour: white lets instance colours through). */
export function surface(kind: Surface, color = "#ffffff", roughness = 0.85, metalness = 0) {
  const key = `${kind}|${color}|${roughness}|${metalness}`;
  let m = cache.get(key);
  if (!m) cache.set(key, (m = detailed(new THREE.MeshStandardMaterial({ color, roughness, metalness }), kind)));
  return m;
}
