import * as THREE from "three";
import { realShader } from "./realism";

/*
 * The skyscrapers' walls (city.tsx draws the towers with it). Plain three.js.
 */

/** The ground floor (shop windows) is this tall; the windows of the floors above start from it. */
const LOBBY = 7;

/**
 * A facade that draws windows on any side of a box, in world units
 * (so big and small towers get the same size windows), with big shop windows
 * on the ground floor: dark reflective glass set back into the wall, with
 * mullions, floor slabs and a granite base, and now and then a lit office or
 * a blind half down. Far away, the windows blend into an even colour instead
 * of shimmering.
 */
export function windowMaterial(style: 0 | 1 | 2) {
  const P = [
    { cell: [3.4, 4.2], win: [0.2, 0.8, 0.24, 0.76] },
    { cell: [1000, 4.2], win: [0, 1, 0.14, 0.72] },
    { cell: [2.6, 8.4], win: [0.3, 0.7, 0.06, 0.94] },
  ][style];
  const cover = (P.win[1] - P.win[0]) * (P.win[3] - P.win[2]);
  const f = (n: number) => n.toFixed(4);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
  m.onBeforeCompile = (shader) => {
    // Real-world colour and weathering (realism.ts), then the facade.
    realShader(shader, "plain");
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vCityPos;\nvarying vec3 vCityNormal;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vec4 cityP = vec4(transformed, 1.0);
      vec3 cityN = objectNormal;
      #ifdef USE_INSTANCING
        cityP = instanceMatrix * cityP;
        cityN = mat3(instanceMatrix) * cityN;
      #endif
      vCityPos = (modelMatrix * cityP).xyz;
      vCityNormal = normalize(mat3(modelMatrix) * cityN);`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vCityPos;
        varying vec3 vCityNormal;
        float cityH = 0.0;
        float cityHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float cityWin = 0.0;
        {
          vec3 n = normalize(vCityNormal);
          if (abs(n.y) < 0.5) {
            bool sideX = abs(n.x) > abs(n.z);
            float u = sideX ? vCityPos.z : vCityPos.x;
            float v = vCityPos.y;
            vec3 wall = diffuseColor.rgb;
            if (v < ${f(LOBBY)}) {
              // The ground floor: big shop windows between stone piers, on a dark granite base.
              float fx = fract(u / 7.0);
              float shop = step(0.1, fx) * step(fx, 0.9) * step(0.9, v) * step(v, ${f(LOBBY - 1.5)});
              float base = step(v, 0.9);
              vec3 granite = vec3(0.16, 0.16, 0.17) * (0.85 + 0.3 * cityHash(floor(vec2(u * 3.0, v * 6.0))));
              diffuseColor.rgb = mix(mix(wall * 0.82, granite, base), vec3(0.08, 0.11, 0.13), shop);
              cityWin = shop;
              cityH = 0.0;
            } else {
              vec2 cell = vec2(u / ${f(P.cell[0])}, (v - ${f(LOBBY)}) / ${f(P.cell[1])});
              vec2 g = fract(cell);
              float win = step(${f(P.win[0])}, g.x) * step(g.x, ${f(P.win[1])}) * step(${f(P.win[2])}, g.y) * step(g.y, ${f(P.win[3])});
              float blur = length(fwidth(cell));
              float far = smoothstep(0.25, 0.75, blur);
              // A mullion down the middle of each window.
              float mull = (1.0 - step(0.5, ${f(P.cell[0])} / 100.0)) * smoothstep(0.022, 0.0, abs(g.x - 0.5)) * win;
              float r = cityHash(floor(cell) + (sideX ? vec2(31.0, 7.0) : vec2(0.0)) + floor(vCityPos.x * 0.02 + vCityPos.z * 0.013) * 3.1);
              // Real glass: dark and blue-grey green (the sky and the city reflect in it), now and then a lit office or a blind half down.
              vec3 glass = mix(vec3(0.07, 0.1, 0.13), vec3(0.11, 0.15, 0.17), r);
              glass = mix(glass, vec3(0.55, 0.46, 0.3), step(0.955, r));
              glass = mix(glass, vec3(0.42, 0.42, 0.4), step(0.88, r) * step(r, 0.92) * step(0.6, g.y));
              // Floor slabs: a band between each floor; faint panel joints on the wall.
              float slab = smoothstep(0.05, 0.0, g.y) + smoothstep(0.95, 1.0, g.y);
              vec3 wallTone = wall * (0.94 + 0.08 * cityHash(floor(cell) * 1.7)) * (1.0 - 0.18 * slab);
              float winM = mix(win * (1.0 - mull), ${f(cover)}, far);
              diffuseColor.rgb = mix(wallTone, glass, winM);
              cityWin = winM;
              // Depth: windows sit back in the wall, the slabs stand out a little.
              // (Soft-edged, so the light rolls over the edges instead of flickering.)
              vec2 fw = fwidth(cell) * 1.5;
              float winS = smoothstep(${f(P.win[0])} - fw.x, ${f(P.win[0])} + fw.x, g.x) * (1.0 - smoothstep(${f(P.win[1])} - fw.x, ${f(P.win[1])} + fw.x, g.x))
                * smoothstep(${f(P.win[2])} - fw.y, ${f(P.win[2])} + fw.y, g.y) * (1.0 - smoothstep(${f(P.win[3])} - fw.y, ${f(P.win[3])} + fw.y, g.y));
              cityH = (1.0 - winS + mull * 0.6) * (1.0 - far);
            }
          }
        }`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n        roughnessFactor = mix(roughnessFactor, 0.06, cityWin);")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 dpdx = dFdx(-vViewPosition);
          vec3 dpdy = dFdy(-vViewPosition);
          float hx = dFdx(cityH);
          float hy = dFdy(cityH);
          vec3 r1 = cross(dpdy, normal);
          vec3 r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          normal = normalize(abs(det) * normal - 0.12 * sign(det) * (hx * r1 + hy * r2));
        }`,
      )
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n        metalnessFactor = mix(metalnessFactor, 0.8, cityWin);");
  };
  m.customProgramCacheKey = () => `city-windows-${style}-real-2`;
  return m;
}
