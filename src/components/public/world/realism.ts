import * as THREE from "three";

/*
 * Real-life look, rather than cartoon. Plain three.js (world-scene.tsx runs it).
 *
 * Most of the world is built from simple shapes painted in bright, flat,
 * toy-like colours. Real things aren't like that: real paint, brick and
 * plastic are less saturated, nothing is pure white or pure black, and every
 * surface has a little grime, wear and variation across it. So every
 * ordinary material (MeshStandardMaterial / MeshPhysicalMaterial) gets a few
 * lines added to its shader:
 *
 *   - its colour is pulled toward real-world values (less saturated, and kept
 *     between the darkest and brightest things really are),
 *   - it gets subtle dirt and weathering that varies across the world (big
 *     soft blotches and fine grit), darker toward the ground where dirt
 *     collects, so no two walls are the same flat colour,
 *   - matte surfaces get a touch more roughness variation, so light
 *     catches them unevenly.
 *
 * It's done in the shader rather than by changing each material's colour, so
 * colours set later (a car you repaint, a light turning green) still come
 * out right. Materials that already have their own shader tweaks (the grass,
 * roads and paving), see-through ones (glass), and the sky are left alone;
 * so are signs and screens (MeshBasicMaterial, which doesn't take light).
 */

const NOISE = /* glsl */ `
  varying vec3 vRealWorld;
  float rHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float rNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(rHash(i + vec3(0, 0, 0)), rHash(i + vec3(1, 0, 0)), f.x), mix(rHash(i + vec3(0, 1, 0)), rHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(rHash(i + vec3(0, 0, 1)), rHash(i + vec3(1, 0, 1)), f.x), mix(rHash(i + vec3(0, 1, 1)), rHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float rFbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * rNoise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }
`;

/** How much colour each kind of surface keeps (1 = all of it). */
const SATURATION = { plain: 0.78, textured: 0.92, metal: 0.85 };

function patch(kind: keyof typeof SATURATION, lite = false) {
  const sat = SATURATION[kind].toFixed(3);
  const grime = kind === "textured" ? "0.5" : "1.0";
  // On slow computers (the Fast setting) just the colour, no weathering (it's noise worked out for every pixel).
  const weather = lite
    ? ""
    : `
          vec3 wp = vRealWorld;
          float blotch = rFbm(wp * 0.18);
          float grit = rNoise(wp * 3.1);
          float low = 1.0 - smoothstep(0.0, 1.6, wp.y);
          float dirt = (blotch - 0.5) * 0.16 + (grit - 0.5) * 0.06 - low * 0.07;
          diffuseColor.rgb *= 1.0 + dirt * ${grime};
          // A faint warm/cool drift between patches, like sun-bleaching and stains.
          diffuseColor.rgb *= mix(vec3(1.015, 1.0, 0.985), vec3(0.985, 1.0, 1.015), blotch);`;
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vRealWorld;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      {
        vec4 realP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          realP = instanceMatrix * realP;
        #endif
        vRealWorld = (modelMatrix * realP).xyz;
      }`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${NOISE}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          // Real-world colour: less saturated, and between the darkest and brightest real surfaces (about 2% … 86%).
          float realL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(vec3(realL), diffuseColor.rgb, ${sat});
          diffuseColor.rgb = 0.02 + diffuseColor.rgb * 0.84;
          // Weathering: big soft blotches, fine grit, and dirt collecting low down.${weather}
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        ${lite ? "" : "roughnessFactor = clamp(roughnessFactor + (rNoise(vRealWorld * 0.9) - 0.5) * 0.14 * step(0.35, roughnessFactor), 0.04, 1.0);"}`,
      );
  };
}

const PATCHES = { plain: patch("plain"), textured: patch("textured"), metal: patch("metal") };
const LITE = { plain: patch("plain", true), textured: patch("textured", true), metal: patch("metal", true) };

/** Lite: just the colour (for the Fast graphics setting). Decided when each material is first seen. */
export const realism = { lite: false };

/** For materials with their own shader tweaks (detail.ts, the towers): add the real-life colour and weathering first. */
export function realShader(shader: THREE.WebGLProgramParametersWithUniforms, kind: keyof typeof PATCHES = "plain") {
  (realism.lite ? LITE : PATCHES)[kind](shader);
}

const seen = new WeakSet<THREE.Material>();

/** Give one material the real-life treatment (once). */
export function realify(m: THREE.Material) {
  if (seen.has(m)) return;
  seen.add(m);
  const s = m as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial) return;
  // Leave alone: materials with their own shader tweaks, glass and other see-through things, things that ignore fog (the sky), and anything that asks.
  if (m.userData.keepLook || s.transparent || s.opacity < 1 || s.fog === false || s.wireframe) return;
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
  const kind = s.map ? "textured" : s.metalness > 0.5 ? "metal" : "plain";
  const lite = realism.lite;
  m.onBeforeCompile = (lite ? LITE : PATCHES)[kind];
  m.customProgramCacheKey = () => `real-${kind}-${lite ? "lite" : "full"}-1`;
  m.needsUpdate = true;
}

/** Go through everything in the scene and give any new materials the treatment. */
export function realifyScene(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) mesh.material.forEach(realify);
    else realify(mesh.material);
  });
}

/*
 * The colour grade (a full-screen pass after everything's drawn), like a
 * film camera or a modern open-world game: a gentle S-curve for contrast,
 * warm sunlit highlights and slightly cool, teal-ish shadows, colours that
 * don't go neon, a soft vignette, and a fine film grain that moves.
 */
export const RealGradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, amount: { value: 1 }, time: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float time;
    varying vec2 vUv;
    float gHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // S-curve: deeper shadows, brighter highlights, the middle left where it is.
      vec3 s = col * col * (3.0 - 2.0 * col);
      col = mix(col, s, 0.55 * amount);
      // Saturation down a little (neon reads as cartoon), more so in the shadows.
      float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l2), col, mix(0.88, 1.02, smoothstep(0.1, 0.6, l)) * amount + (1.0 - amount));
      // Split tone: warm highlights, cool teal shadows.
      col += amount * (vec3(0.045, 0.022, -0.025) * smoothstep(0.45, 1.0, l) + vec3(-0.02, 0.006, 0.024) * (1.0 - smoothstep(0.0, 0.45, l)));
      // Lift the very darkest a hair (real cameras never quite hit black).
      col = max(col, vec3(0.012, 0.014, 0.018) * amount);
      // Vignette.
      vec2 d = vUv - 0.5;
      col *= 1.0 - amount * 0.32 * smoothstep(0.3, 0.9, length(d * vec2(1.3, 1.0)));
      // Film grain.
      col += amount * (gHash(vUv * 931.7 + fract(time) * 71.3) - 0.5) * 0.028;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};
