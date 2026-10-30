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
import { RealGradeShader } from "./realism";

/*
 * How good the 3D world looks (and how hard your computer works):
 *
 *   Ultra   sharpest, big soft shadows, ambient occlusion (soft shading
 *           where things meet), bloom (lights glow) and the film-like
 *           colour grade. For fast computers with a good graphics card.
 *   High    the same world, materials, sky, soft shadows and colour grade,
 *           without ambient occlusion and bloom (they're what costs the
 *           most). The default.
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
  ultra: { dpr: [1, inApp ? 2 : 1.75] as [number, number], shadowMap: 4096, shadows: true, post: true, ao: true, bloom: true, shadowEvery: 1 },
  high: { dpr: [1, 1.25] as [number, number], shadowMap: 2048, shadows: true, post: true, ao: false, bloom: false, shadowEvery: 2 },
  fast: { dpr: [0.75, 1] as [number, number], shadowMap: 1024, shadows: false, post: false, ao: false, bloom: false, shadowEvery: 3 },
};

/** Bloom, ambient occlusion and the colour grade (on Ultra and High). Takes over drawing the frame. */
export function Effects() {
  const level = useQuality();
  const q = QUALITY[level];
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const passes = useMemo(() => {
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
    if (q.bloom) c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.6, 1.35));
    c.addPass(new OutputPass());
    // The colour grade: film-like contrast and colour, a vignette and grain (realism.ts).
    const grade = new ShaderPass(RealGradeShader);
    c.addPass(grade);
    return { composer: c, grade };
  }, [gl, scene, camera, q.post, q.ao, q.bloom]);
  const composer = passes?.composer ?? null;

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
  useFrame((state) => {
    frame.n++;
    if (passes) passes.grade.uniforms.time.value = state.clock.elapsedTime;
    if (frame.n % q.shadowEvery === 0) gl.shadowMap.needsUpdate = true;
    if (composer) composer.render();
    else gl.render(scene, camera);
  }, 1);
  return null;
}
