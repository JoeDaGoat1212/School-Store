"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { show } from "./near";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TessellateModifier } from "three/examples/jsm/modifiers/TessellateModifier.js";
import { canvasTexture, noRaycast } from "./paint";
import type { Body } from "./vehicles";

/*
 * A realistic car: its body is a side profile (bumpers, hood, roof line,
 * trunk, wheel arches) extruded across with rounded edges, under glossy
 * clear-coated paint, with a tinted glasshouse, door lines, mirrors, a
 * grille, headlights and tail lights, number plates, and wheels with tyres,
 * spoked rims and brake discs. Body styles: sedan, hatchback, SUV, pickup,
 * sports coupe and supercar. Motorbikes are MotorbikeModel.
 *
 * Whatever drives it (you, the traffic, the police) fills in a CarLook each
 * frame; the car reads it and moves its wheels, lights and body to match.
 * The front points toward -z. Every car is about 7 long and 3.4 wide (so
 * they all bump into things the same way).
 */

export type CarLook = {
  /** How far the wheels have rolled (radians). */
  spin: number;
  /** Front wheels' steering angle (radians, + = left). */
  steer: number;
  braking: boolean;
  reversing: boolean;
  /** Nose down (+) when braking, up when speeding up; lean in turns. */
  pitch: number;
  roll: number;
};

export const newLook = (): CarLook => ({ spin: 0, steer: 0, braking: false, reversing: false, pitch: 0, roll: 0 });

const BRAKE_OFF = new THREE.Color("#5a120e");
const BRAKE_ON = new THREE.Color("#ff4a35").multiplyScalar(1.6);
const REVERSE_OFF = new THREE.Color("#7a7a7a");
const REVERSE_ON = new THREE.Color("#ffffff").multiplyScalar(1.4);

/** One body style's shape: the side profile of the lower body and of the glasshouse (s = along the car, front -3.5 … back 3.5; h = height). */
type Style = {
  body: [number, number][];
  glass: [number, number][];
  /** Where the wheels are (along) and how big. */
  wheels: number[];
  wheelR: number;
  width: number;
  /** The top of the roof (for the roof panel), and where it starts/ends along the car. */
  roof: [number, number, number];
  /** Headlight and tail light height. */
  lights: number;
  spoiler?: boolean;
  bed?: boolean;
};

const STYLES: Record<Exclude<Body, "moto" | "plane" | "heli">, Style> = {
  sedan: {
    body: [
      [-3.5, 0.62],
      [-3.56, 0.95],
      [-3.42, 1.28],
      [-3.0, 1.42],
      [-1.15, 1.6],
      [2.25, 1.62],
      [3.2, 1.55],
      [3.52, 1.3],
      [3.56, 0.85],
      [3.45, 0.55],
    ],
    glass: [
      [-1.22, 1.58],
      [-0.2, 2.5],
      [1.35, 2.5],
      [2.3, 1.62],
    ],
    wheels: [-2.2, 2.25],
    wheelR: 0.6,
    width: 3.3,
    roof: [-0.15, 1.3, 2.52],
    lights: 1.25,
  },
  hatch: {
    body: [
      [-3.3, 0.62],
      [-3.36, 0.95],
      [-3.24, 1.3],
      [-2.8, 1.45],
      [-1.0, 1.62],
      [2.9, 1.66],
      [3.3, 1.5],
      [3.36, 0.85],
      [3.25, 0.55],
    ],
    glass: [
      [-1.08, 1.6],
      [-0.05, 2.55],
      [2.55, 2.5],
      [3.05, 1.66],
    ],
    wheels: [-2.1, 2.2],
    wheelR: 0.58,
    width: 3.2,
    roof: [0.0, 2.55, 2.56],
    lights: 1.3,
  },
  suv: {
    body: [
      [-3.52, 0.8],
      [-3.6, 1.2],
      [-3.45, 1.7],
      [-3.0, 1.88],
      [-1.25, 2.05],
      [3.3, 2.1],
      [3.52, 1.9],
      [3.58, 1.0],
      [3.45, 0.72],
    ],
    glass: [
      [-1.32, 2.02],
      [-0.4, 3.0],
      [3.05, 3.0],
      [3.35, 2.1],
    ],
    wheels: [-2.25, 2.3],
    wheelR: 0.7,
    width: 3.45,
    roof: [-0.45, 3.1, 3.02],
    lights: 1.65,
  },
  pickup: {
    body: [
      [-3.55, 0.8],
      [-3.62, 1.2],
      [-3.48, 1.75],
      [-3.0, 1.92],
      [-1.0, 2.05],
      [3.5, 2.05],
      [3.58, 1.0],
      [3.45, 0.72],
    ],
    glass: [
      [-1.08, 2.02],
      [-0.25, 2.95],
      [0.95, 2.95],
      [1.15, 2.05],
    ],
    wheels: [-2.3, 2.3],
    wheelR: 0.72,
    width: 3.45,
    roof: [-0.3, 1.2, 2.97],
    lights: 1.7,
    bed: true,
  },
  sports: {
    body: [
      [-3.55, 0.48],
      [-3.62, 0.78],
      [-3.4, 1.0],
      [-2.8, 1.1],
      [-0.9, 1.3],
      [2.6, 1.38],
      [3.45, 1.3],
      [3.6, 1.0],
      [3.55, 0.6],
      [3.42, 0.42],
    ],
    glass: [
      [-1.0, 1.28],
      [0.15, 2.05],
      [1.0, 2.05],
      [2.85, 1.38],
    ],
    wheels: [-2.25, 2.25],
    wheelR: 0.62,
    width: 3.45,
    roof: [0.1, 1.05, 2.07],
    lights: 1.0,
    spoiler: true,
  },
  super: {
    body: [
      [-3.62, 0.4],
      [-3.7, 0.62],
      [-3.4, 0.82],
      [-1.6, 1.1],
      [-0.6, 1.25],
      [2.9, 1.32],
      [3.55, 1.22],
      [3.66, 0.8],
      [3.55, 0.38],
    ],
    glass: [
      [-1.7, 1.08],
      [-0.4, 1.86],
      [0.6, 1.86],
      [2.5, 1.32],
    ],
    wheels: [-2.25, 2.3],
    wheelR: 0.64,
    width: 3.6,
    roof: [-0.35, 0.95, 1.88],
    lights: 0.85,
    spoiler: true,
  },
};

// ---- The body's shape ---------------------------------------------------------------------------

/**
 * The profile with extra points along each straight stretch (so the body can
 * curve in plan view), and its corners softened just a little: real cars
 * have crisp character lines, not rounded pebbles.
 */
function smooth(points: [number, number][], per = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [s0, h0] = points[i];
    const [s1, h1] = points[i + 1];
    for (let k = 0; k < per; k++) out.push([s0 + ((s1 - s0) * k) / per, h0 + ((h1 - h0) * k) / per]);
  }
  out.push(points[points.length - 1]);
  // Soften each original corner a touch (a small fillet), keeping the line between them.
  for (let pass = 0; pass < 2; pass++)
    for (let i = 1; i < out.length - 1; i++) {
      if (i % per !== 0) continue;
      const [a, b, c] = [out[i - 1], out[i], out[i + 1]];
      out[i] = [b[0] * 0.5 + (a[0] + c[0]) * 0.25, b[1] * 0.5 + (a[1] + c[1]) * 0.25];
    }
  return out;
}
const PER = 8;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** How far toward the nose or tail a point is (0 in the middle, 1 at the very end). */
const endOf = (z: number) => clamp01((Math.abs(z) / 3.6 - 0.55) / 0.45);

/**
 * How much narrower (or wider) the body is at height y and point z along it,
 * than its full width: rounded off at the nose and tail when seen from
 * above, a gentle swell along the doors, and the sides curving in toward
 * the windows (real cars are never boxes).
 */
function sideScale(st: Style, y: number, z: number) {
  const belt = st.glass[0][1];
  const t = clamp01((y - 0.5) / Math.max(0.3, belt - 0.5));
  const bulge = 1 + 0.03 * Math.sin(t * Math.PI);
  const tumble = 1 - 0.06 * THREE.MathUtils.smoothstep(y, belt - 0.45, belt + 0.1);
  return (1 - 0.15 * endOf(z) ** 2) * bulge * tumble;
}
/** The glasshouse leans in as it goes up (the windows slope, the roof is narrower than the doors). */
function glassScale(st: Style, y: number, z: number) {
  const t = clamp01((y - st.glass[0][1]) / Math.max(0.3, st.roof[2] - st.glass[0][1]));
  return (1 - 0.1 * endOf(z) ** 2) * (1 - 0.17 * t);
}

/** Extrude a side profile across the car's width (rounded edges), front toward -z, then shape it (scale x by `shape`). */
function profileGeometry(points: [number, number][], width: number, bevel: number, shape: (y: number, z: number) => number, arches?: { wheels: number[]; r: number; cy: number; base: number }) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const [a, h] of points.slice(1)) s.lineTo(a, h);
  if (arches) {
    // Along the bottom, back to front, with a round notch over each wheel.
    const [rear, front] = [...arches.wheels].sort((a, b) => b - a);
    const { r, cy, base } = arches;
    for (const w of [rear, front]) {
      s.lineTo(w + r, base);
      s.lineTo(w + r, cy);
      s.absarc(w, cy, r, 0, Math.PI, false);
      s.lineTo(w - r, base);
    }
  }
  s.closePath();
  const raw = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 14 });
  // Split the big flat side panels into small triangles first, so they curve smoothly (no streaks) when shaped.
  const g = new TessellateModifier(0.35, 8).modify(raw);
  raw.dispose();
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * shape(p.getY(i), p.getZ(i)));
  return smoothed(g);
}

/** Shade curved panels smoothly, but keep sharp creases sharp (where two faces meet at more than ~35°). */
function smoothed(g: THREE.BufferGeometry) {
  const m = toCreasedNormals(g, 0.6);
  if (m !== g) g.dispose();
  // (Everything merged together needs the same attributes, and an index.)
  if (!m.attributes.uv) m.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(m.attributes.position.count * 2), 2));
  if (!m.index) m.setIndex(Array.from({ length: m.attributes.position.count }, (_, i) => i));
  return m;
}

/**
 * A band along a curve in the side view (thickness `out` outside the curve
 * and `inn` inside it), swept across `width` and placed at x = xAt(y, z):
 * the roof skin, and the pillars either side of the windscreen and back window.
 */
function bandGeometry(pts: [number, number][], out: number, inn: number, width: number, xAt: (y: number, z: number) => number) {
  const normals = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const ds = b[0] - a[0];
    const dh = b[1] - a[1];
    const l = Math.hypot(ds, dh) || 1;
    return [-dh / l, ds / l];
  });
  const s = new THREE.Shape();
  pts.forEach(([a, h], i) => (i ? s.lineTo(a + normals[i][0] * out, h + normals[i][1] * out) : s.moveTo(a + normals[i][0] * out, h + normals[i][1] * out)));
  for (let i = pts.length - 1; i >= 0; i--) s.lineTo(pts[i][0] - normals[i][0] * inn, pts[i][1] - normals[i][1] * inn);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + xAt(p.getY(i), p.getZ(i)));
  return smoothed(g);
}

/** Where a smooth profile crosses height y: its front-most (or back-most) point. */
function edgeAt(points: [number, number][], y: number, front: boolean) {
  let best = front ? Infinity : -Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const [s0, h0] = points[i];
    const [s1, h1] = points[i + 1];
    if ((h0 - y) * (h1 - y) > 0 || h0 === h1) continue;
    const s = s0 + ((y - h0) / (h1 - h0)) * (s1 - s0);
    best = front ? Math.min(best, s) : Math.max(best, s);
  }
  return Number.isFinite(best) ? best : front ? points[0][0] : points[points.length - 1][0];
}

// ---- Parts, merged into a few meshes per body style ---------------------------------------------

type PartKey = "paint" | "black" | "chrome" | "lens" | "plate" | "inside" | "insideDark" | "brake" | "reverse" | "liner" | "grille";
type Parts = Partial<Record<PartKey, THREE.BufferGeometry[]>>;
const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  round: new THREE.SphereGeometry(1, 16, 12),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  torus: new THREE.TorusGeometry(1, 0.13, 8, 28),
};
const EUL = new THREE.Euler();
const QUAT = new THREE.Quaternion();
const MAT4 = new THREE.Matrix4();
function put(parts: Parts, key: PartKey, geo: THREE.BufferGeometry, pos: [number, number, number], scale: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
  const g = geo.clone();
  QUAT.setFromEuler(EUL.set(rot[0], rot[1], rot[2], "YXZ"));
  g.applyMatrix4(MAT4.compose(new THREE.Vector3(...pos), QUAT, new THREE.Vector3(...scale)));
  (parts[key] ??= []).push(g);
}
type CarGeo = { body: THREE.BufferGeometry; glass: THREE.BufferGeometry; parts: Partial<Record<PartKey, THREE.BufferGeometry>>; seat: { x: number; y: number; z: number } };
const geoCache = new Map<string, CarGeo>();

function buildCar(kind: keyof typeof STYLES): CarGeo {
  const st = STYLES[kind];
  const W = st.width / 2;
  const bodyPts = smooth(st.body);
  const glassPts = smooth(st.glass);
  const belt = st.glass[0][1];
  const roofTop = st.roof[2];
  const ws = st.glass[0][0];
  const rw = st.glass[st.glass.length - 1][0];
  const cabin = rw - ws;
  const two = kind === "sports" || kind === "super" || kind === "pickup";
  const body = profileGeometry(bodyPts, st.width, 0.2, (y, z) => sideScale(st, y, z), { wheels: st.wheels, r: st.wheelR + 0.12, cy: st.wheelR, base: Math.min(st.body[0][1], st.body[st.body.length - 1][1]) });
  const glassW = st.width - 0.42;
  const glass = profileGeometry(glassPts, glassW, 0.08, (y, z) => glassScale(st, y, z));
  /** Half the body's width at (y, z), on its outside. */
  const side = (y: number, z: number) => W * sideScale(st, y, z);
  const gside = (y: number, z: number) => (glassW / 2) * glassScale(st, y, z);
  const P: Parts = {};
  const L = st.lights;
  const front = edgeAt(bodyPts, L, true);
  const back = edgeAt(bodyPts, L, false);

  // ---- The glasshouse: a body-coloured roof skin and pillars round tinted glass ----
  const aPts = glassPts.slice(0, PER + 1);
  const roofPts = glassPts.slice(PER, PER * 2 + 1);
  const cPts = glassPts.slice(PER * 2);
  (P.paint ??= []).push(bandGeometry(roofPts, 0.05, 0.02, glassW * 0.84, () => 0));
  for (const sgn of [-1, 1]) {
    (P.paint ??= []).push(bandGeometry(aPts, 0.02, 0.1, 0.16, (y, z) => sgn * (gside(y, z) - 0.07)));
    (P.paint ??= []).push(bandGeometry(cPts, 0.02, 0.16, 0.24, (y, z) => sgn * (gside(y, z) - 0.11)));
    // Black rubber round the whole side window.
    (P.black ??= []).push(bandGeometry(glassPts, 0.012, 0.07, 0.03, (y, z) => sgn * (gside(y, z) + 0.002)));
    // The B-pillar (black), and the black frame round the side windows.
    const bz = ws + cabin * (two ? 0.78 : 0.47);
    const bTop = roofTop - 0.08;
    put(P, "black", UNIT.box, [sgn * (gside((belt + bTop) / 2, bz) + 0.005), (belt + bTop) / 2, bz], [0.05, bTop - belt, 0.16], [0, 0, sgn * 0.17]);
    put(P, "black", UNIT.box, [sgn * (side(belt - 0.04, (ws + rw) / 2) - 0.03), belt + 0.02, (ws + rw) / 2], [0.06, 0.05, rw - ws + 0.2]);
    // Chrome belt line along the doors.
    put(P, "chrome", UNIT.box, [sgn * (side(belt - 0.36, (ws + rw) / 2) + 0.004), belt - 0.36, (ws + rw) / 2], [0.02, 0.035, rw - ws - 0.2]);
    // Door shut lines and handles (two doors a side, or one on two-seaters).
    const doors = two ? [ws - 0.15, ws + cabin * 0.82] : [ws - 0.15, ws + cabin * 0.5, ws + cabin * 0.93];
    for (const dz of doors) put(P, "black", UNIT.box, [sgn * (side((0.95 + belt) / 2, dz) + 0.003), (0.95 + belt) / 2 - 0.05, dz], [0.01, belt - 1.05, 0.02]);
    for (let k = 0; k < doors.length - 1; k++) {
      const hz = doors[k + 1] - 0.45;
      put(P, "chrome", UNIT.box, [sgn * (side(belt - 0.22, hz) + 0.012), belt - 0.22, hz], [0.035, 0.06, 0.3]);
    }
    // Side skirt.
    put(P, "black", UNIT.box, [sgn * (side(0.6, 0) - 0.06), 0.62, (st.wheels[0] + st.wheels[1]) / 2], [0.1, 0.14, st.wheels[1] - st.wheels[0] - st.wheelR * 2.5]);
    // Mirror: a stalk and a rounded housing, just behind the windscreen's base.
    const mz = ws + 0.3;
    const mx = side(belt + 0.05, mz);
    put(P, "black", UNIT.box, [sgn * (mx + 0.08), belt + 0.06, mz], [0.18, 0.06, 0.12]);
    put(P, "paint", UNIT.round, [sgn * (mx + 0.24), belt + 0.13, mz + 0.05], [0.13, 0.11, 0.17]);
    put(P, "black", UNIT.box, [sgn * (mx + 0.24), belt + 0.13, mz + 0.18], [0.2, 0.15, 0.02]);
    // Wheel-arch liners.
    for (const wz of st.wheels) put(P, "liner", ARCH, [sgn * (W - 0.32), st.wheelR, wz], [0.6, st.wheelR + 0.1, st.wheelR + 0.1]);
    // Headlight: a chrome bezel, a lens, and a thin daytime running light underneath.
    const hx = sgn * (W * sideScale(st, L, front) * 0.62);
    const hz = edgeAt(bodyPts, L, true);
    put(P, "black", UNIT.round, [hx, L, hz + 0.1], [0.42, 0.13, 0.14]);
    put(P, "lens", UNIT.round, [hx, L + 0.01, hz + 0.05], [0.36, 0.1, 0.1]);
    put(P, "lens", UNIT.box, [hx - sgn * 0.05, L - 0.13, edgeAt(bodyPts, L - 0.13, true) - 0.01], [0.5, 0.025, 0.04]);
    // Fog light.
    put(P, "chrome", UNIT.cyl, [sgn * (W * 0.6), 0.75, edgeAt(bodyPts, 0.75, true) - 0.01], [0.09, 0.06, 0.09], [Math.PI / 2, 0, 0]);
    // Tail light: a long red lens with the reversing light inside it.
    const tz = edgeAt(bodyPts, L, false);
    put(P, "brake", UNIT.round, [sgn * (W * sideScale(st, L, back) * 0.62), L, tz - 0.06], [0.5, 0.12, 0.1]);
    put(P, "reverse", UNIT.box, [sgn * (W * sideScale(st, L, back) * 0.3), L, tz - 0.01], [0.18, 0.08, 0.05]);
    // Exhausts.
    put(P, "chrome", UNIT.cyl, [sgn * 0.75, 0.48, back - 0.02], [0.09, 0.32, 0.09], [Math.PI / 2, 0, 0]);
  }
  // Wipers at the bottom of the windscreen, and the shut lines of the bonnet and boot.
  for (const sgn of [-1, 1]) put(P, "black", UNIT.box, [sgn * 0.45 - 0.2, belt + 0.06, ws - 0.1], [1.0, 0.03, 0.05], [0, sgn * 0.12, -0.04]);
  const hoodZ = ws - 0.35;
  put(P, "black", UNIT.box, [0, bodyPts.reduce((m, [a, h]) => (Math.abs(a - hoodZ) < 0.15 ? Math.max(m, h) : m), 0) + 0.004, hoodZ], [st.width * 0.8, 0.012, 0.015]);
  if (!st.bed) {
    const bootZ = rw + 0.25;
    put(P, "black", UNIT.box, [0, bodyPts.reduce((m, [a, h]) => (Math.abs(a - bootZ) < 0.15 ? Math.max(m, h) : m), 0) + 0.004, bootZ], [st.width * 0.78, 0.012, 0.015]);
  }
  // ---- Front and back ----
  const gz = edgeAt(bodyPts, L - 0.3, true);
  put(P, "grille", UNIT.box, [0, L - 0.3, gz - 0.005], [st.width * 0.4, 0.36, 0.06]);
  put(P, "chrome", UNIT.box, [0, L - 0.1, edgeAt(bodyPts, L - 0.1, true) - 0.02], [st.width * 0.42, 0.04, 0.04]);
  put(P, "grille", UNIT.box, [0, 0.72, edgeAt(bodyPts, 0.72, true) - 0.005], [st.width * 0.55, 0.16, 0.06]);
  put(P, "plate", UNIT.box, [0, L - 0.6, edgeAt(bodyPts, L - 0.6, true) - 0.02], [0.78, 0.25, 0.03]);
  put(P, "plate", UNIT.box, [0, L - 0.42, edgeAt(bodyPts, L - 0.42, false) + 0.02], [0.78, 0.25, 0.03]);
  put(P, "black", UNIT.box, [0, 0.6, edgeAt(bodyPts, 0.6, false) + 0.01], [st.width * 0.7, 0.12, 0.08]);
  put(P, "black", UNIT.box, [0, 0.6, edgeAt(bodyPts, 0.6, true) - 0.01], [st.width * 0.7, 0.12, 0.08]);
  // Third brake light at the top of the back window, and an aerial on the roof.
  put(P, "brake", UNIT.box, [0, roofTop - 0.06, edgeAt(glassPts, roofTop - 0.06, false) - 0.05], [0.5, 0.04, 0.04]);
  put(P, "black", UNIT.cyl, [0, roofTop + 0.18, st.roof[1] - 0.25], [0.012, 0.35, 0.012], [-0.4, 0, 0]);
  if (kind === "suv") for (const sgn of [-1, 1]) put(P, "black", UNIT.box, [sgn * glassW * 0.36, roofTop + 0.1, (st.roof[0] + st.roof[1]) / 2], [0.07, 0.07, st.roof[1] - st.roof[0]]);
  if (st.spoiler) {
    const sy = bodyPts.reduce((m, [a, h]) => (a > back - 0.7 ? Math.max(m, h) : m), 0) + 0.32;
    put(P, kind === "super" ? "black" : "paint", UNIT.box, [0, sy, back - 0.45], [st.width - 0.5, 0.05, 0.5], [-0.12, 0, 0]);
    for (const sgn of [-1, 1]) put(P, "black", UNIT.box, [sgn * (W - 0.6), sy - 0.18, back - 0.45], [0.06, 0.36, 0.2]);
  }
  if (st.bed) {
    // The pickup's open bed: a dark floor, with the body's sides round it.
    put(P, "black", UNIT.box, [0, 2.07, 2.35], [st.width - 0.5, 0.04, 2.2]);
  }

  // ---- Inside: seats, dashboard, steering wheel, mirror (seen through the glass) ----
  const seatZ = ws + cabin * (two ? 0.62 : 0.4);
  const seatX = W * 0.42;
  // A trim panel over the top of the body inside (so you don't see paint through the windows), just above the highest the body goes along the cabin.
  const sill = bodyPts.reduce((m, [a, h]) => (a > ws && a < rw ? Math.max(m, h) : m), belt) + 0.02;
  put(P, "insideDark", UNIT.box, [0, sill, (ws + rw) / 2], [glassW * 0.9, 0.03, cabin - 0.05]);
  const seat = (x: number, z: number, w: number) => {
    put(P, "inside", UNIT.box, [x, belt - 0.42, z - 0.3], [w, 0.18, 0.62]);
    put(P, "inside", UNIT.box, [x, belt - 0.1, z], [w, 0.82, 0.2], [-0.2, 0, 0]);
    put(P, "inside", UNIT.box, [x, belt + 0.43, z + 0.07], [w * 0.55, 0.26, 0.16], [-0.2, 0, 0]);
    put(P, "insideDark", UNIT.box, [x, belt + 0.3, z + 0.07], [0.03, 0.12, 0.03]);
  };
  for (const sgn of [-1, 1]) seat(sgn * seatX, seatZ, 0.8);
  if (!two) seat(0, ws + cabin * 0.82, glassW * 0.86);
  // The dashboard, with a hood over the instruments, and the screen in the middle.
  put(P, "insideDark", UNIT.box, [0, belt - 0.02, ws + 0.4], [glassW - 0.2, 0.18, 0.7]);
  put(P, "insideDark", UNIT.box, [-seatX, belt + 0.1, ws + 0.62], [0.55, 0.12, 0.28]);
  put(P, "lens", UNIT.box, [0, belt + 0.12, ws + 0.62], [0.36, 0.2, 0.03], [-0.3, 0, 0]);
  // Steering wheel and column.
  put(P, "insideDark", UNIT.torus, [-seatX, belt + 0.12, ws + 0.95], [0.21, 0.21, 0.21], [-0.35, 0, 0]);
  put(P, "insideDark", UNIT.cyl, [-seatX, belt + 0.06, ws + 0.8], [0.04, 0.4, 0.04], [Math.PI / 2 - 0.35, 0, 0]);
  // Rear-view mirror.
  const mz = edgeAt(glassPts, roofTop - 0.18, true) + 0.25;
  put(P, "black", UNIT.box, [0, roofTop - 0.2, mz], [0.32, 0.09, 0.03]);

  const parts = Object.fromEntries(Object.entries(P).map(([k, list]) => [k, mergeGeometries(list!)])) as CarGeo["parts"];
  for (const list of Object.values(P)) list?.forEach((g) => g.dispose());
  // Where the driver sits (their hips), for whoever drives it.
  // The top of the driver's cushion, and where their hips go along the car.
  return { body, glass, parts, seat: { x: -seatX, y: belt - 0.33, z: seatZ - 0.3 } };
}

/** The top half of a short tube: the black liner inside each wheel arch. */
const ARCH = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);

export function carGeometry(kind: keyof typeof STYLES) {
  let g = geoCache.get(kind);
  if (!g) geoCache.set(kind, (g = buildCar(kind)));
  return g;
}

/** The top of the driver's seat cushion in a car (or on a bike) of this body, and where their hips go (car-local units). */
export function driverSeat(body: Body) {
  if (body === "moto") return { x: 0, y: MOTO_SEAT + 0.03, z: 0.55 };
  const kind = (body in STYLES ? body : "sedan") as keyof typeof STYLES;
  return carGeometry(kind).seat;
}

// Shared materials (the paint is made per colour).
const paintCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function paint(color: string) {
  let m = paintCache.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.08 });
    paintCache.set(color, m);
  }
  return m;
}
/** A fine honeycomb for the grilles. */
let grilleTex: THREE.Texture | null = null;
export function grilleTexture() {
  if (grilleTex) return grilleTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a2d31";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#07080a";
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.fillRect(x * 16 + (y % 2) * 8 + 2, y * 16 + 3, 12, 10);
  grilleTex = canvasTexture(c, [10, 3]);
  grilleTex.wrapS = grilleTex.wrapT = THREE.RepeatWrapping;
  return grilleTex;
}
export const M = {
  // See-through tinted glass (you can see the seats and the dashboard inside).
  glass: new THREE.MeshPhysicalMaterial({ color: "#26323d", roughness: 0.03, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.42, depthWrite: false }),
  tyre: new THREE.MeshStandardMaterial({ color: "#151619", roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ color: "#c3c8ce", roughness: 0.22, metalness: 0.9 }),
  disc: new THREE.MeshStandardMaterial({ color: "#5c6168", roughness: 0.4, metalness: 0.8 }),
  trim: new THREE.MeshStandardMaterial({ color: "#121316", roughness: 0.4, metalness: 0.2 }),
  liner: new THREE.MeshStandardMaterial({ color: "#0c0d0f", roughness: 0.95, side: THREE.DoubleSide }),
  chrome: new THREE.MeshStandardMaterial({ color: "#e8ecf0", roughness: 0.1, metalness: 1 }),
  head: new THREE.MeshPhysicalMaterial({ color: "#f6f2e6", emissive: "#fff3d6", emissiveIntensity: 0.6, roughness: 0.05, clearcoat: 1 }),
  plate: new THREE.MeshStandardMaterial({ color: "#f2f2ec", roughness: 0.5 }),
  red: new THREE.MeshStandardMaterial({ color: "#b3121b", roughness: 0.4, metalness: 0.3 }),
  grille: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.4 }),
};
/** Interior trim: black, grey or tan leather (picked from the paint colour, so each car keeps its own). */
const INSIDES = [
  [new THREE.MeshStandardMaterial({ color: "#1f2023", roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: "#151618", roughness: 0.55 })],
  [new THREE.MeshStandardMaterial({ color: "#5a5d62", roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: "#26282b", roughness: 0.55 })],
  [new THREE.MeshStandardMaterial({ color: "#8a6a4a", roughness: 0.65 }), new THREE.MeshStandardMaterial({ color: "#2b2420", roughness: 0.55 })],
];
export const insideOf = (color: string) => INSIDES[[...color].reduce((a, c) => a + c.charCodeAt(0), 0) % INSIDES.length];

/** Tyres with rounded sidewalls (a profile spun round), and a dished rim. */
export const WHEEL_GEO = {
  tyre: new THREE.LatheGeometry(
    [
      [0.62, -0.5],
      [0.86, -0.5],
      [0.95, -0.45],
      [1.0, -0.33],
      [1.0, 0.33],
      [0.95, 0.45],
      [0.86, 0.5],
      [0.62, 0.5],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    36,
  ).rotateZ(Math.PI / 2),
  rim: new THREE.CylinderGeometry(1, 1, 1, 28).rotateZ(Math.PI / 2),
  spoke: new THREE.BoxGeometry(0.04, 1, 0.09),
  box: new THREE.BoxGeometry(1, 1, 1),
  cap: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2),
  lip: new THREE.TorusGeometry(1, 0.06, 8, 36).rotateY(Math.PI / 2),
};

/** A soft red blur (made once, shared by every car) for the glow behind the brake lights. */
let glow: THREE.Texture | null = null;
function glowTexture() {
  if (glow) return glow;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  for (const x of [34, 94]) {
    const grad = g.createRadialGradient(x, 32, 2, x, 32, 34);
    grad.addColorStop(0, "rgba(255,70,40,0.9)");
    grad.addColorStop(1, "rgba(255,70,40,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 64);
  }
  glow = canvasTexture(c);
  return glow;
}

function Wheel({ x, z, r, spinRef, steerRef, width = 0.6, sporty = false }: { x: number; z: number; r: number; spinRef: (g: THREE.Group | null) => void; steerRef: (g: THREE.Group | null) => void; width?: number; sporty?: boolean }) {
  const side = x > 0 ? 1 : -1;
  const face = side * (width / 2 - 0.02);
  return (
    <group position={[x, r, z]} ref={steerRef}>
      <group ref={spinRef}>
        <mesh geometry={WHEEL_GEO.tyre} material={M.tyre} scale={[width, r, r]} castShadow raycast={noRaycast} />
        {/* The rim: a dished barrel, ten slim spokes, a centre cap and wheel nuts */}
        <mesh geometry={WHEEL_GEO.rim} material={M.disc} position-x={side * 0.02} scale={[width * 0.9, r * 0.62, r * 0.62]} raycast={noRaycast} />
        <mesh geometry={WHEEL_GEO.rim} material={M.trim} position-x={face - side * 0.03} scale={[0.05, r * 0.62, r * 0.62]} raycast={noRaycast} />
        <mesh geometry={WHEEL_GEO.lip} material={M.rim} position-x={face + side * 0.02} scale={r * 0.62} raycast={noRaycast} />
        {Array.from({ length: 10 }, (_, k) => (
          <mesh key={k} geometry={WHEEL_GEO.spoke} material={M.rim} position-x={face + side * 0.03} rotation-x={(k / 10) * Math.PI * 2} scale={[1, r * 1.22, 1]} raycast={noRaycast} />
        ))}
        <mesh geometry={WHEEL_GEO.cap} material={M.chrome} position-x={face + side * 0.05} scale={[0.06 * side, r * 0.14, r * 0.14]} raycast={noRaycast} />
        {Array.from({ length: 5 }, (_, k) => (
          <mesh key={`n${k}`} geometry={WHEEL_GEO.rim} material={M.chrome} position={[face + side * 0.06, Math.cos((k / 5) * Math.PI * 2) * r * 0.22, Math.sin((k / 5) * Math.PI * 2) * r * 0.22]} scale={[0.03, 0.035, 0.035]} raycast={noRaycast} />
        ))}
      </group>
      {/* Brake disc and caliper (they don't spin: you see them through the spokes) */}
      <mesh geometry={WHEEL_GEO.rim} material={M.disc} position-x={side * (width / 2 - 0.14)} scale={[0.05, r * 0.52, r * 0.52]} raycast={noRaycast} />
      <mesh geometry={WHEEL_GEO.box} material={sporty ? M.red : M.trim} position={[side * (width / 2 - 0.1), r * 0.36, r * 0.22]} rotation-x={0.6} scale={[0.1, r * 0.22, r * 0.3]} raycast={noRaycast} />
    </group>
  );
}

/** Cars closer than this are drawn in full detail. */
const CAR_NEAR = 55;
const CAR_AT = new THREE.Vector3();
const FAR_TYRE = new THREE.CylinderGeometry(1, 1, 1, 12);

export function CarModel({ color, look, body = "sedan", rider }: { color: string; look: CarLook; body?: Body; rider?: ReactNode }) {
  if (body === "moto") return <MotorbikeModel color={color} look={look} rider={rider} />;
  const kind = (body in STYLES ? body : "sedan") as keyof typeof STYLES;
  return <Car color={color} look={look} kind={kind} rider={rider} />;
}

function Car({ color, look, kind, rider }: { color: string; look: CarLook; kind: keyof typeof STYLES; rider?: ReactNode }) {
  const st = STYLES[kind];
  const geo = useMemo(() => carGeometry(kind), [kind]);
  const bodyRef = useRef<THREE.Group>(null);
  const steers = useRef<(THREE.Group | null)[]>([]);
  const spins = useRef<(THREE.Group | null)[]>([]);
  const halo = useRef<THREE.Mesh>(null);
  const detail = useRef<THREE.Group>(null);
  const nearWheels = useRef<THREE.Group>(null);
  const farWheels = useRef<THREE.Group>(null);
  // This car's own light materials (so one car braking doesn't light up every car).
  const brake = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#3a0806", emissive: BRAKE_OFF, roughness: 0.1, clearcoat: 1, toneMapped: false }), []);
  const reverse = useMemo(() => new THREE.MeshBasicMaterial({ color: REVERSE_OFF, toneMapped: false }), []);
  const p = paint(color);
  const [inside, insideDark] = insideOf(color);
  const grille = useMemo(() => {
    const m = M.grille.clone();
    m.map = grilleTexture();
    return m;
  }, []);
  const back = edgeAt(smooth(st.body), st.lights, false);
  const sporty = kind === "sports" || kind === "super";

  useFrame(({ camera }, delta) => {
    // Level of detail: far off, only the body, the glass and the tyres are drawn.
    if (bodyRef.current) {
      bodyRef.current.getWorldPosition(CAR_AT);
      const near = CAR_AT.distanceToSquared(camera.position) < CAR_NEAR * CAR_NEAR;
      if (detail.current) show(detail.current, near);
      if (nearWheels.current) show(nearWheels.current, near);
      if (farWheels.current) show(farWheels.current, !near);
      if (!near) return;
    }
    steers.current.forEach((w, i) => {
      if (w) w.rotation.y = i < 2 ? look.steer : 0;
    });
    spins.current.forEach((s) => {
      if (s) s.rotation.x = -look.spin;
    });
    brake.emissive.lerp(look.braking ? BRAKE_ON : BRAKE_OFF, 1 - Math.exp(-20 * delta));
    reverse.color.copy(look.reversing ? REVERSE_ON : REVERSE_OFF);
    if (halo.current) halo.current.visible = look.braking;
    if (bodyRef.current) {
      bodyRef.current.rotation.x = THREE.MathUtils.damp(bodyRef.current.rotation.x, -look.pitch, 8, delta);
      bodyRef.current.rotation.z = THREE.MathUtils.damp(bodyRef.current.rotation.z, look.roll, 8, delta);
    }
  });

  const parts = geo.parts;
  const part = (k: PartKey, m: THREE.Material, shadow = false) => (parts[k] ? <mesh geometry={parts[k]} material={m} castShadow={shadow} raycast={noRaycast} /> : null);
  const wheelX = st.width / 2 - 0.36;
  return (
    <group>
      <group ref={bodyRef} position-y={0.9}>
        <group position-y={-0.9}>
          <mesh geometry={geo.body} material={p} castShadow receiveShadow raycast={noRaycast} />
          <mesh geometry={geo.glass} material={M.glass} raycast={noRaycast} />
          {/* Whoever's driving sits inside, behind the wheel */}
          {rider}
          <group ref={detail}>
            {part("paint", p, true)}
            {part("black", M.trim)}
            {part("chrome", M.chrome)}
            {part("lens", M.head)}
            {part("plate", M.plate)}
            {part("liner", M.liner)}
            {part("grille", grille)}
            {part("inside", inside)}
            {part("insideDark", insideDark)}
            {part("brake", brake)}
            {part("reverse", reverse)}
            {/* The glow behind the brake lights */}
            <mesh ref={halo} position={[0, st.lights, back + 0.12]} visible={false} raycast={noRaycast}>
              <planeGeometry args={[st.width + 1, 1.6]} />
              <meshBasicMaterial map={glowTexture()} transparent opacity={0.7} toneMapped={false} depthWrite={false} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Far away: just the tyres. */}
      <group ref={farWheels} visible={false}>
        {[
          [-wheelX, st.wheels[0]],
          [wheelX, st.wheels[0]],
          [-wheelX, st.wheels[1]],
          [wheelX, st.wheels[1]],
        ].map(([x, z], i) => (
          <mesh key={i} geometry={FAR_TYRE} material={M.tyre} position={[x, st.wheelR, z]} rotation-z={Math.PI / 2} scale={[st.wheelR, 0.5, st.wheelR]} raycast={noRaycast} />
        ))}
      </group>
      {/* Wheels: an outer part that steers, an inner part that rolls */}
      <group ref={nearWheels}>
        {[
          [-wheelX, st.wheels[0]],
          [wheelX, st.wheels[0]],
          [-wheelX, st.wheels[1]],
          [wheelX, st.wheels[1]],
        ].map(([x, z], i) => (
          <Wheel
            key={i}
            x={x}
            z={z}
            r={st.wheelR}
            sporty={sporty}
            steerRef={(g) => {
              steers.current[i] = g;
            }}
            spinRef={(g) => {
              spins.current[i] = g;
            }}
          />
        ))}
      </group>
    </group>
  );
}

// ---- Motorbikes ---------------------------------------------------------------------------------

/** How high the bike's seat is (where the rider's hips sit). */
const MOTO_SEAT = 1.52;

/**
 * A motorbike: spoked wheels with discs, a frame and swingarm, the engine,
 * a sculpted fuel tank, a two-level seat, a tail with its light, a fairing
 * with a screen, clip-on bars, mirrors, footpegs and the exhaust. It leans
 * into turns (look.roll), and so does whoever's riding it (`rider`, drawn
 * on the seat).
 */
export function MotorbikeModel({ color, look, rider }: { color: string; look: CarLook; rider?: ReactNode }) {
  const lean = useRef<THREE.Group>(null);
  const bars = useRef<THREE.Group>(null);
  const spins = useRef<(THREE.Group | null)[]>([]);
  const brake = useMemo(() => new THREE.MeshBasicMaterial({ color: BRAKE_OFF, toneMapped: false }), []);
  const p = paint(color);
  useFrame((_, delta) => {
    spins.current.forEach((s) => {
      if (s) s.rotation.x = -look.spin * 1.15;
    });
    if (bars.current) bars.current.rotation.y = look.steer;
    if (lean.current) lean.current.rotation.z = THREE.MathUtils.damp(lean.current.rotation.z, look.roll * 4, 6, delta);
    brake.color.lerp(look.braking ? BRAKE_ON : BRAKE_OFF, 1 - Math.exp(-20 * delta));
  });
  const r = 0.66;
  return (
    <group ref={lean}>
      {[-1.45, 1.4].map((z, i) => (
        <group key={i} position={[0, r, z]}>
          <group
            ref={(g) => {
              spins.current[i] = g;
            }}
          >
            <mesh geometry={WHEEL_GEO.tyre} material={M.tyre} scale={[0.34, r, r]} castShadow raycast={noRaycast} />
            <mesh geometry={WHEEL_GEO.rim} material={M.trim} scale={[0.2, r * 0.66, r * 0.66]} raycast={noRaycast} />
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <mesh key={k} geometry={WHEEL_GEO.spoke} material={M.rim} rotation-x={(k / 6) * Math.PI * 2} scale={[3, r * 1.2, 0.6]} raycast={noRaycast} />
            ))}
          </group>
          {/* Brake discs either side */}
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={WHEEL_GEO.rim} material={M.disc} position-x={s * 0.13} scale={[0.02, r * 0.48, r * 0.48]} raycast={noRaycast} />
          ))}
        </group>
      ))}
      {/* Frame (twin spars), swingarm, engine and exhaust */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={WHEEL_GEO.box} material={M.disc} position={[s * 0.2, 1.2, -0.35]} rotation-x={0.45} scale={[0.07, 0.16, 1.3]} raycast={noRaycast} />
          <mesh geometry={WHEEL_GEO.box} material={M.trim} position={[s * 0.17, 0.78, 0.85]} rotation-x={0.12} scale={[0.06, 0.12, 1.2]} raycast={noRaycast} />
          {/* Footpegs */}
          <mesh geometry={WHEEL_GEO.rim} material={M.chrome} position={[s * 0.3, 0.92, 0.35]} scale={[0.18, 0.025, 0.025]} raycast={noRaycast} />
        </group>
      ))}
      <mesh geometry={WHEEL_GEO.box} material={M.disc} position={[0, 0.82, -0.05]} scale={[0.46, 0.55, 0.85]} castShadow raycast={noRaycast} />
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} geometry={WHEEL_GEO.rim} material={M.chrome} position={[x, 0.72, -0.45]} scale={[0.14, 0.09, 0.09]} raycast={noRaycast} />
      ))}
      <mesh geometry={WHEEL_GEO.rim} material={M.chrome} position={[0.28, 0.85, 1.0]} rotation-y={Math.PI / 2} rotation-z={0.2} scale={[1.0, 0.1, 0.1]} raycast={noRaycast} />
      <mesh geometry={WHEEL_GEO.rim} material={M.trim} position={[0.28, 0.95, 1.5]} rotation-y={Math.PI / 2} rotation-z={0.2} scale={[0.1, 0.12, 0.12]} raycast={noRaycast} />
      {/* Rear shock */}
      <mesh geometry={WHEEL_GEO.rim} material={mat("#d4a72c", 0.35, 0.7)} position={[0, 1.1, 0.55]} rotation-x={-0.6} rotation-z={Math.PI / 2} scale={[0.4, 0.05, 0.05]} raycast={noRaycast} />
      {/* The fuel tank: a sculpted teardrop, with a cap */}
      <mesh position={[0, 1.5, -0.4]} scale={[0.36, 0.3, 0.62]} rotation-x={0.12} material={p} castShadow raycast={noRaycast}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      <mesh geometry={WHEEL_GEO.rim} material={M.chrome} position={[0, 1.79, -0.42]} rotation-z={Math.PI / 2} scale={[0.02, 0.07, 0.07]} raycast={noRaycast} />
      {/* The seat (rider, and a step up for a passenger), the tail and its light */}
      <mesh position={[0, MOTO_SEAT - 0.04, 0.45]} scale={[0.24, 0.07, 0.48]} material={M.trim} castShadow raycast={noRaycast}>
        <sphereGeometry args={[1, 18, 10]} />
      </mesh>
      <mesh position={[0, MOTO_SEAT + 0.08, 1.0]} scale={[0.17, 0.08, 0.22]} material={M.trim} raycast={noRaycast}>
        <sphereGeometry args={[1, 14, 10]} />
      </mesh>
      <mesh position={[0, MOTO_SEAT - 0.02, 1.2]} rotation-x={-0.35} scale={[0.2, 0.12, 0.45]} material={p} castShadow raycast={noRaycast}>
        <sphereGeometry args={[1, 18, 12]} />
      </mesh>
      <mesh geometry={WHEEL_GEO.box} material={brake} position={[0, MOTO_SEAT + 0.05, 1.6]} scale={[0.22, 0.07, 0.04]} raycast={noRaycast} />
      {/* Front fork, bars, fairing, screen, headlight and mirrors (they steer) */}
      <group ref={bars} position={[0, 0, -1.2]}>
        {[-0.14, 0.14].map((x) => (
          <mesh key={x} geometry={WHEEL_GEO.rim} material={mat("#d4a72c", 0.35, 0.7)} position={[x, 1.15, -0.1]} rotation-x={0.35} rotation-z={Math.PI / 2} scale={[1.2, 0.05, 0.05]} raycast={noRaycast} />
        ))}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh geometry={WHEEL_GEO.rim} material={M.trim} position={[s * 0.3, 1.78, 0.15]} scale={[0.32, 0.03, 0.03]} raycast={noRaycast} />
            <mesh geometry={WHEEL_GEO.rim} material={M.trim} position={[s * 0.46, 1.78, 0.15]} scale={[0.12, 0.045, 0.045]} raycast={noRaycast} />
            <mesh geometry={WHEEL_GEO.box} material={M.trim} position={[s * 0.36, 2.0, -0.05]} scale={[0.02, 0.3, 0.02]} raycast={noRaycast} />
            <mesh position={[s * 0.4, 2.15, -0.05]} scale={[0.1, 0.06, 0.03]} material={M.chrome} raycast={noRaycast}>
              <sphereGeometry args={[1, 12, 8]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 1.55, -0.28]} scale={[0.32, 0.36, 0.45]} material={p} castShadow raycast={noRaycast}>
          <sphereGeometry args={[1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        </mesh>
        <mesh position={[0, 1.95, -0.32]} rotation-x={-0.55} scale={[0.28, 0.32, 0.02]} material={M.glass} raycast={noRaycast}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
        <mesh position={[0, 1.45, -0.62]} scale={[0.18, 0.12, 0.08]} material={M.head} raycast={noRaycast}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
      </group>
      {/* The rider, on the seat (leaning with the bike) */}
      {rider}
    </group>
  );
}

const bikeMats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough: number, metal: number) {
  const k = `${color}|${rough}|${metal}`;
  let m = bikeMats.get(k);
  if (!m) bikeMats.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })));
  return m;
}
