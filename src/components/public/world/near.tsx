"use client";

import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/*
 * Only drawn while the camera's within `dist` of (x, z): for the insides of
 * buildings, and other detailed things you only see up close. (Hidden
 * things cost nothing to draw, and their animations skip too where they
 * check visibility.)
 */
export function Near({ x, z, dist, children }: { x: number; z: number; dist: number; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (g.current) g.current.visible = (camera.position.x - x) ** 2 + (camera.position.z - z) ** 2 < dist * dist;
  });
  return <group ref={g}>{children}</group>;
}
