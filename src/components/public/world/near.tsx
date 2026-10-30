"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/*
 * Only drawn while the camera's within `dist` of (x, z): for the insides of
 * buildings, and other detailed things you only see up close. (Hidden
 * things cost nothing to draw, and their animations skip too where they
 * check visibility.)
 */
const groups = new Set<THREE.Group>();

export function Near({ x, z, dist, when, children }: { x: number; z: number; dist: number; when?: (cam: THREE.Vector3) => boolean; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useEffect(() => {
    const me = g.current;
    if (!me) return;
    groups.add(me);
    return () => {
      groups.delete(me);
    };
  }, []);
  useFrame(({ camera }) => {
    if (g.current) show(g.current, (camera.position.x - x) ** 2 + (camera.position.z - z) ** 2 < dist * dist && (!when || when(camera.position)));
  });
  return <group ref={g}>{children}</group>;
}

/**
 * Show or hide something. Hidden, three.js also stops working out where
 * everything inside it is each frame (it would otherwise go through every
 * part of every hidden building, every frame).
 */
export function show(o: THREE.Object3D, on: boolean) {
  o.visible = on;
  o.matrixWorldAutoUpdate = on;
}

/*
 * A moment after the world loads, get the graphics card to prepare the
 * shaders for everything that's hidden for now (the insides of buildings,
 * close-up detail), in the background. Otherwise each one's prepared the
 * first time you walk up to it, which is a noticeable stutter.
 */
export function Prewarm() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const t = setTimeout(() => {
      const hidden: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (!o.visible && (groups.has(o as THREE.Group) || o.userData.lod)) {
          hidden.push(o);
          o.visible = true;
          o.updateMatrixWorld(true);
        }
      });
      try {
        // Collects what to prepare right now (then we hide it all again before the next frame).
        void gl.compileAsync(scene, camera).catch(() => {});
      } finally {
        hidden.forEach((o) => (o.visible = false));
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [gl, scene, camera]);
  return null;
}
