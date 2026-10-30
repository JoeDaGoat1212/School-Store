"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { notify, useGameVersion } from "./game-events";

/*
 * How good the 3D world looks (and how hard your computer works):
 *
 *   Ultra   sharpest, big soft shadows, ambient occlusion (soft shading
 *           where things meet), bloom (lights and neon glow) and colour
 *           grading. For fast computers with a good graphics card.
 *   High    the same world, materials, sky and soft shadows, without the
 *           extra effects passes (they're what costs the most). The default.
 *   Fast    no shadows, lower resolution: for older computers and phones.
 *
 * It starts on High (Fast on phones, Ultra in the desktop app), drops a level by itself if the
 * world's running slowly, and you can pick one yourself (it's remembered).
 */

export type Quality = "ultra" | "high" | "fast";
/** Running in the Firebirds Nest desktop app (desktop/), rather than a browser. */
export const inApp = typeof navigator !== "undefined" && navigator.userAgent.includes("FirebirdsNestApp");
const KEY = "nest:graphics";

function initial(): { level: Quality; chosen: boolean } {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "ultra" || v === "high" || v === "fast") return { level: v, chosen: true };
  } catch {
    // Private browsing.
  }
  const phone = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 700);
  // The desktop app runs on the fast graphics card: start on Ultra (it still drops a level if it can't keep up).
  return { level: inApp ? "ultra" : phone ? "fast" : "high", chosen: false };
}

export const graphics = { ...(typeof window === "undefined" ? { level: "high" as Quality, chosen: false } : initial()) };

export function setQuality(level: Quality, chosen = true) {
  graphics.level = level;
  if (chosen) {
    graphics.chosen = true;
    try {
      localStorage.setItem(KEY, level);
    } catch {
      // Not a problem.
    }
  }
  notify();
}
/** Running slowly: one level down (unless you picked the level yourself). */
export function slowDown() {
  if (graphics.chosen) return;
  if (graphics.level === "ultra") setQuality("high", false);
  else if (graphics.level === "high") setQuality("fast", false);
}
export function useQuality() {
  useGameVersion();
  return graphics.level;
}
export const QUALITY = {
  ultra: { dpr: [1, inApp ? 2 : 1.75] as [number, number], shadowMap: 4096, shadows: true, post: true, ao: true, shadowEvery: 1 },
  high: { dpr: [1, 1.25] as [number, number], shadowMap: 2048, shadows: true, post: false, ao: false, shadowEvery: 2 },
  fast: { dpr: [0.75, 1] as [number, number], shadowMap: 1024, shadows: false, post: false, ao: false, shadowEvery: 3 },
};

/** A gentle colour grade: a little more contrast and warmth, and a soft vignette. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, amount: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      // Contrast round mid-grey, a touch of saturation, warm highlights and cool shadows.
      col = (col - 0.5) * (1.0 + 0.08 * amount) + 0.5;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.0 + 0.12 * amount);
      col += amount * (vec3(0.025, 0.012, -0.01) * smoothstep(0.5, 1.0, l) + vec3(-0.01, 0.0, 0.02) * (1.0 - smoothstep(0.0, 0.4, l)));
      // Vignette.
      vec2 d = vUv - 0.5;
      col *= 1.0 - amount * 0.28 * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

/** Bloom, ambient occlusion and the colour grade (on Ultra and High). Takes over drawing the frame. */
export function Effects() {
  const level = useQuality();
  const q = QUALITY[level];
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const composer = useMemo(() => {
    if (!q.post) return null;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(gl, target);
    c.addPass(new RenderPass(scene, camera));
    if (q.ao) {
      const ao = new GTAOPass(scene, camera, 1, 1);
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.5, thickness: 1.5, scale: 1, samples: 12 });
      c.addPass(ao);
    }
    // Lights, neon and the sun on chrome glow a little.
    c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.6, 1.35));
    c.addPass(new OutputPass());
    c.addPass(new ShaderPass(GradeShader));
    return c;
  }, [gl, scene, camera, q.post, q.ao]);

  useEffect(() => {
    if (!composer) return;
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    return () => composer.dispose();
  }, [composer, gl, size.width, size.height]);

  // With effects on, draw the frame through them (priority 1 takes over from the normal render).
  // Shadows are re-drawn every frame on Ultra, every other frame on High (you can't tell, and it's a lot less work).
  const frame = useMemo(() => ({ n: 0 }), []);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame(() => {
    frame.n++;
    if (frame.n % q.shadowEvery === 0) gl.shadowMap.needsUpdate = true;
    if (composer) composer.render();
    else gl.render(scene, camera);
  }, 1);
  return null;
}
