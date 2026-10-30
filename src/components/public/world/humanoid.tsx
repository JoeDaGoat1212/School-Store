"use client";

import { useMemo, useRef } from "react";
import { show } from "./near";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { noRaycast } from "./paint";

/*
 * A person, sculpted to real human proportions and anatomy (in metres, 1.82
 * m tall, then scaled to the world): a real head shape (skull, brow, cheek
 * bones, jaw and chin, a nose, eye sockets) with eyes (whites, coloured irises,
 * pupils, eyelids), eyebrows, lips and ears; hair that follows a real
 * hairline; a neck and trapezius; a chest, waist and shoulders; arms with
 * shoulders, biceps, forearms and hands with fingers and thumbs; legs with
 * thighs, knees, calves and ankles; shoes with soles and heels; and clothes
 * (a collar, short or long sleeves, belt, trousers). It walks with bending
 * knees and swinging arms, runs, jumps, puts its hands up, gets handcuffed,
 * sits (on a chair, in a car, on a bike), leans forward, holds a gun, or
 * falls over. Outfits: everyday clothes, police uniform, prison guard (with
 * a rifle and a keycard on the belt), shop uniform with an apron, suit, or
 * an orange prison jumpsuit.
 *
 * Whoever owns a Humanoid fills in its `pose` every frame; the model reads it.
 * Standing height is HUMAN_HEIGHT world units (you're the same size).
 */

export const HUMAN_HEIGHT = 3.35;
/** Built in metres (1.82 m tall), then scaled up to world units. */
const S = HUMAN_HEIGHT / 1.82;
/** Where the hips are (world units above the feet) when sitting this much (0 standing … 1 sitting). */
export const hipsHeight = (sit: number) => (0.95 - 0.45 * sit) * S;
/** How far below the hips the seat of the trousers is (world units): sit someone on a seat by putting their hips this far above it. */
export const PELVIS_BELOW = 0.14 * S;

export type Outfit = "casual" | "cop" | "guard" | "worker" | "suit" | "prisoner";

export type Look = {
  skin: string;
  hair: string;
  hairStyle?: "short" | "long" | "bald" | "buzz" | "bun";
  shirt: string;
  pants: string;
  shoes?: string;
  outfit?: Outfit;
  /** Apron / accent colour (workers), cap colour (cops). */
  accent?: string;
  /** Eye colour (picked from the skin tone if not given). */
  eyes?: string;
};

export type Pose = {
  /** Walk cycle phase (radians; keep adding to it while moving). */
  phase: number;
  /** 0 standing … 1 walking … 2 running. */
  gait: number;
  handsUp: number;
  cuffed: number;
  sit: number;
  /** In the air (legs tuck a little). */
  air: number;
  /** Holding a gun out in front (or reaching for a steering wheel / handlebars). */
  aim: number;
  /** Lying on the ground (0…1). */
  down: number;
  /** Reaching out (pickpocketing, handing over food…). */
  reach: number;
  /** Leaning forward from the hips (radians), like riding a sports bike. */
  lean?: number;
  /** Standing over a golf ball, club in hand (0…1), and where the swing is (-1 top of the backswing, 0 impact, 1 the finish). */
  golf?: number;
  swing?: number;
  /** The keycard on the belt (guards) is there. */
  keycard: boolean;
};

export const newPose = (): Pose => ({ phase: 0, gait: 0, handsUp: 0, cuffed: 0, sit: 0, air: 0, aim: 0, down: 0, reach: 0, lean: 0, keycard: true });

// ---- Materials: one per colour, shared by everyone ----------------------------------------------

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.75, metal = 0) {
  const k = `${color}|${rough}|${metal}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    mats.set(k, m);
  }
  return m;
}
/** Skin: soft, with a warm sheen where light grazes it (a stand-in for light glowing through skin). Kept true to colour (no weathering). */
const skins = new Map<string, THREE.MeshPhysicalMaterial>();
function skinMat(color: string) {
  let m = skins.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.52, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ff6a4a"), 0.35), clearcoat: 0.08, clearcoatRoughness: 0.6 });
    m.userData.keepLook = true;
    skins.set(color, m);
  }
  return m;
}
const keep = (m: THREE.MeshStandardMaterial) => ((m.userData.keepLook = true), m);
const lipColor = (skin: string) => `#${new THREE.Color(skin).lerp(new THREE.Color("#9a3f3a"), 0.32).getHexString()}`;
const shade = (hex: string, k: number) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

// ---- Shapes (built once, shared) ---------------------------------------------------------------

const sm = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const gauss = (v: number, c: number, w: number) => Math.exp(-(((v - c) / w) ** 2));
const HEAD = { w: 0.074, h: 0.112, d: 0.095 };

/** A point on the head, from a point on a unit sphere (z = the face side): skull, brow, eye sockets, cheekbones, nose, lips, jaw and chin. */
function headPoint(x: number, y: number, z: number): [number, number, number] {
  let X = x * HEAD.w;
  const Y = y * HEAD.h;
  let Z = z * HEAD.d;
  const face = sm(0.2, 0.9, z);
  // The skull is fuller at the back and crown.
  if (z < 0) Z *= 1 + 0.12 * -z * sm(-0.7, 0.3, y);
  // Jaw and chin: narrower toward the bottom, the chin a little forward.
  const low = sm(-0.15, -0.95, y);
  X *= 1 - 0.32 * low * (0.6 + 0.4 * face);
  Z += 0.013 * low * face;
  // Cheekbones, and temples a little in.
  X *= 1 + 0.05 * gauss(y, -0.08, 0.22) * face - 0.03 * gauss(y, 0.35, 0.15) * face;
  // Brow ridge.
  Z += 0.006 * face * gauss(y, 0.3, 0.09);
  // Eye sockets.
  for (const s of [-1, 1]) Z -= 0.009 * face * gauss(x, s * 0.4, 0.17) * gauss(y, 0.13, 0.11);
  // The nose: a ridge from the bridge to the tip, then under it the philtrum.
  const nose = gauss(x, 0, 0.11) * face;
  const t = Math.min(1, Math.max(0, (0.22 - y) / 0.45));
  Z += nose * (0.004 + 0.026 * t * t) * sm(-0.36, -0.25, y);
  Z += 0.008 * face * gauss(x, 0, 0.13) * gauss(y, -0.27, 0.05);
  // Lips, and the muzzle round the mouth.
  Z += 0.006 * face * gauss(x, 0, 0.32) * gauss(y, -0.5, 0.12);
  return [X, Y, Z];
}
/** The head's surface in front of a unit-sphere point (for putting the eyes, lips and so on on the face). */
function facePoint(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(...headPoint(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))));
}

const HEAD_GEO = (() => {
  const g = new THREE.SphereGeometry(1, 56, 44);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...headPoint(p.getX(i), p.getY(i), p.getZ(i)));
  g.computeVertexNormals();
  return g;
})();

/** Hair: a shell over the head with a real hairline (high at the forehead, over the ears, low at the nape). */
function hairGeometry(thick: number, volume: number, nape: number, sides: number) {
  const g = new THREE.SphereGeometry(1, 48, 36);
  const p = g.attributes.position;
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.abs(Math.atan2(x, z)) / Math.PI; // 0 front … 0.5 side … 1 back
    // (A natural hairline: highest in the middle of the forehead, dipping at the temples, down to sideburns by the ears.)
    const line = a < 0.5 ? THREE.MathUtils.lerp(0.46, sides, sm(0.02, 0.42, a)) + 0.05 * Math.cos(Math.min(1, a / 0.18) * Math.PI) : THREE.MathUtils.lerp(sides, nape, sm(0.5, 0.95, a));
    const on = sm(line - 0.04, line + 0.05, y);
    const [hx, hy, hz] = headPoint(x, y, z);
    n.set(x / HEAD.w, y / HEAD.h, z / HEAD.d).normalize();
    const t = on * (thick + volume * Math.max(0, y)) - (1 - on) * 0.006;
    p.setXYZ(i, hx + n.x * t, hy + n.y * t, hz + n.z * t);
  }
  g.computeVertexNormals();
  return g;
}
const HAIR = {
  short: hairGeometry(0.009, 0.012, -0.5, -0.05),
  buzz: hairGeometry(0.0025, 0, -0.55, 0.05),
  long: hairGeometry(0.011, 0.01, -0.85, -0.6),
  bun: hairGeometry(0.008, 0.006, -0.55, 0.0),
};

/** A limb: a profile (radius going down from the joint) spun round, so it has real muscle shape. */
function limb(profile: [number, number][]) {
  // From the bottom up, so the faces point outward.
  const pts = [...profile].reverse().map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 20);
  g.computeVertexNormals();
  return g;
}
const UPPER_ARM = limb([
  [0, 0.03],
  [0.042, 0.012],
  [0.05, -0.04],
  [0.049, -0.11],
  [0.042, -0.21],
  [0.036, -0.28],
  [0.03, -0.3],
  [0, -0.31],
]);
const SLEEVE = limb([
  [0, 0.045],
  [0.058, 0.02],
  [0.062, -0.05],
  [0.058, -0.15],
  [0.056, -0.17],
  [0.045, -0.172],
]);
const LONG_SLEEVE = limb([
  [0, 0.045],
  [0.058, 0.02],
  [0.062, -0.05],
  [0.056, -0.15],
  [0.05, -0.26],
  [0.044, -0.3],
  [0, -0.31],
]);
const FOREARM = limb([
  [0, 0.02],
  [0.036, 0.005],
  [0.042, -0.05],
  [0.04, -0.1],
  [0.032, -0.18],
  [0.026, -0.24],
  [0.023, -0.26],
  [0, -0.27],
]);
const FOREARM_SLEEVE = limb([
  [0, 0.03],
  [0.046, 0.01],
  [0.048, -0.06],
  [0.042, -0.16],
  [0.037, -0.22],
  [0.036, -0.235],
  [0.026, -0.236],
]);
const THIGH = limb([
  [0, 0.04],
  [0.075, 0.02],
  [0.088, -0.05],
  [0.084, -0.14],
  [0.074, -0.26],
  [0.06, -0.38],
  [0.054, -0.44],
  [0, -0.47],
]);
const SHIN = limb([
  [0, 0.03],
  [0.054, 0.01],
  [0.057, -0.06],
  [0.06, -0.13],
  [0.052, -0.24],
  [0.04, -0.34],
  [0.032, -0.4],
  [0, -0.43],
]);
const NECK = limb([
  [0, 0.11],
  [0.046, 0.1],
  [0.05, 0.05],
  [0.056, 0.0],
  [0.06, -0.02],
  [0, -0.03],
]);

/**
 * The torso: rounded cross-sections (wider than deep) going up from the
 * waist: waist, chest, shoulders, then the trapezius sloping in to the neck.
 * (y, half width, half depth in front, half depth behind)
 */
const TORSO_PROFILE: [number, number, number, number][] = [
  [-0.12, 0.15, 0.1, 0.1],
  [0.0, 0.134, 0.093, 0.09],
  [0.12, 0.145, 0.1, 0.094],
  [0.24, 0.165, 0.116, 0.1],
  [0.32, 0.178, 0.11, 0.1],
  [0.39, 0.182, 0.088, 0.086],
  [0.44, 0.125, 0.066, 0.07],
  [0.49, 0.062, 0.056, 0.056],
  [0.5, 0.0, 0.0, 0.0],
];
function torsoGeometry(grow = 0) {
  const rows = TORSO_PROFILE.length;
  const steps = 6;
  const seg = 32;
  const pos: number[] = [];
  const idx: number[] = [];
  const at = (t: number) => {
    const f = t * (rows - 1);
    const i = Math.min(rows - 2, Math.floor(f));
    const k = f - i;
    const e = k * k * (3 - 2 * k);
    const [a, b] = [TORSO_PROFILE[i], TORSO_PROFILE[i + 1]];
    return a.map((v, j) => v + (b[j] - v) * (j === 0 ? k : e));
  };
  const ringCount = (rows - 1) * steps + 1;
  for (let r = 0; r < ringCount; r++) {
    const [y, w, df, db] = at(r / (ringCount - 1));
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      // A rounded-square section (superellipse), fuller at the front of the chest.
      const ex = 2 / 2.6;
      const x = (w + grow) * Math.sign(c) * Math.abs(c) ** ex;
      const z = (sn > 0 ? df : db) * Math.sign(sn) * Math.abs(sn) ** ex + (w > 0 ? Math.sign(sn) * grow : 0);
      pos.push(x, y, z);
    }
  }
  for (let r = 0; r < ringCount - 1; r++)
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  // Close the bottom (it sits inside the hips anyway).
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const TORSO_GEO = torsoGeometry();
const VEST_GEO = torsoGeometry(0.02);
const PELVIS = new THREE.CapsuleGeometry(0.14, 0.08, 6, 16);

const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  lid: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42),
  finger: new THREE.CapsuleGeometry(1, 1, 3, 8).translate(0, -0.5, 0),
  lip: new THREE.CapsuleGeometry(1, 1, 4, 10).rotateZ(Math.PI / 2),
  torus: new THREE.TorusGeometry(1, 0.2, 8, 24),
  ear: (() => {
    // A flattened ear with a fold at the back.
    const g = new THREE.SphereGeometry(1, 14, 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const z = p.getZ(i);
      p.setXYZ(i, p.getX(i) * (0.3 + 0.2 * Math.max(0, -z)), y, z * (1 - 0.2 * Math.max(0, y)));
    }
    g.computeVertexNormals();
    return g;
  })(),
};

/** Where the face parts go (on the head's surface). */
const FACE = {
  eye: [-1, 1].map((s) => facePoint(s * 0.4, 0.13).add(new THREE.Vector3(0, 0, -0.0045))),
  brow: [-1, 1].map((s) => facePoint(s * 0.4, 0.3).add(new THREE.Vector3(0, 0, 0.002))),
  upperLip: facePoint(0, -0.5).add(new THREE.Vector3(0, 0, -0.002)),
  lowerLip: facePoint(0, -0.6).add(new THREE.Vector3(0, 0, -0.003)),
  nostril: [-1, 1].map((s) => facePoint(s * 0.11, -0.25).add(new THREE.Vector3(0, -0.004, -0.004))),
};

const FAR = 150;
const NEAR = 38;
const SEE = new THREE.Vector3();

const EYES: Record<string, string> = { light: "#4f7392", mid: "#6b4a2b", dark: "#3a2414" };
function eyeColor(look: Look) {
  if (look.eyes) return look.eyes;
  const l = new THREE.Color(look.skin).getHSL({ h: 0, s: 0, l: 0 }).l;
  return l > 0.72 ? EYES.light : l > 0.55 ? EYES.mid : EYES.dark;
}

export function Humanoid({ look, pose, castShadow = true }: { look: Look; pose: Pose; castShadow?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const simple = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const chest = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const sh = useRef<(THREE.Group | null)[]>([]);
  const el = useRef<(THREE.Group | null)[]>([]);
  const hp = useRef<(THREE.Group | null)[]>([]);
  const kn = useRef<(THREE.Group | null)[]>([]);
  const gun = useRef<THREE.Group>(null);
  const card = useRef<THREE.Mesh>(null);
  const cuffs = useRef<THREE.Group>(null);
  const club = useRef<THREE.Group>(null);

  const o = look.outfit ?? "casual";
  const skin = skinMat(look.skin);
  const shirt = mat(look.shirt, o === "suit" ? 0.5 : 0.88);
  const collar = mat(shade(look.shirt, 0.82), 0.88);
  const pants = mat(look.pants, 0.82);
  const shoeColor = look.shoes ?? (o === "casual" ? "#f2f2f2" : "#1b1d21");
  const shoes = mat(shoeColor, 0.45);
  const sole = mat(shoeColor === "#f2f2f2" ? "#d9d4c8" : "#111214", 0.8);
  const hair = keep(mat(look.hair, 0.62));
  const dark = mat("#1b1d21", 0.4);
  const white = keep(mat("#f4f1ea", 0.25));
  const iris = keep(mat(eyeColor(look), 0.2));
  const pupil = keep(mat("#050505", 0.1));
  const lips = skinMat(lipColor(look.skin));
  const nostril = keep(mat(shade(look.skin, 0.35), 0.8));
  const gold = mat("#d4a72c", 0.35, 0.8);
  const metal = mat("#2a2e33", 0.35, 0.7);
  const accent = mat(look.accent ?? "#e5483b", 0.8);
  const longSleeves = o !== "casual" && o !== "worker";
  const style = look.hairStyle ?? "short";

  useFrame(({ camera }) => {
    // Far away: not drawn at all (and not animated), which saves a lot.
    const r = root.current;
    if (r) {
      r.getWorldPosition(SEE);
      const d2 = SEE.distanceToSquared(camera.position);
      // Up close: every detail, animated. Further off: a simple figure. Far away: nothing.
      const near = d2 < NEAR * NEAR;
      show(r, near);
      if (simple.current) show(simple.current, !near && d2 < FAR * FAR);
      if (!near) return;
    }
    const p = pose;
    const g = Math.min(2, p.gait);
    const walk = Math.min(1, g);
    const run = Math.max(0, g - 1);
    const swing = Math.sin(p.phase);
    const amp = (0.45 + run * 0.35) * walk * (1 - p.sit) * (1 - p.down);
    // Body bob and lean.
    if (hips.current) {
      hips.current.position.y = 0.95 - Math.abs(Math.cos(p.phase)) * 0.03 * walk - p.sit * 0.45 - p.air * 0.05;
      hips.current.rotation.y = swing * 0.08 * walk;
    }
    if (chest.current) {
      chest.current.rotation.x = run * 0.25 + p.reach * 0.25 + (p.lean ?? 0);
      chest.current.rotation.y = -swing * 0.12 * walk;
    }
    if (root.current) {
      root.current.rotation.x = -p.down * Math.PI * 0.5;
      root.current.position.y = p.down * 0.25;
    }
    // Keep looking ahead when leaning forward.
    if (head.current) head.current.rotation.x = -run * 0.15 + p.cuffed * 0.25 - (p.lean ?? 0) * 0.8;
    // Legs.
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const leg = hp.current[i];
      const knee = kn.current[i];
      if (leg) leg.rotation.x = s * swing * amp * 1.1 - p.sit * 1.5 - p.air * 0.5 * (i ? 1 : 0.4);
      if (knee) knee.rotation.x = Math.max(0, -s * Math.cos(p.phase) * amp * 1.3) + p.sit * 1.5 + p.air * 0.9;
    }
    // Arms: swing, or up, or behind the back (cuffed), or out front (aiming / reaching).
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const a = sh.current[i];
      const e = el.current[i];
      if (!a || !e) continue;
      let rx = -s * swing * amp * 0.9;
      let rz = s * 0.06;
      let ex = -0.25 - run * 0.9 * walk;
      rx += (-Math.PI * 0.95 - rx) * p.handsUp;
      rz += (s * 0.35 - rz) * p.handsUp;
      ex += (-0.15 - ex) * p.handsUp;
      rx += (0.55 - rx) * p.cuffed;
      rz += (-s * 0.25 - rz) * p.cuffed;
      ex += (-0.9 - ex) * p.cuffed;
      rx += (-1.45 - rx) * p.aim;
      rz += (-s * 0.25 - rz) * p.aim;
      ex += (-0.1 - ex) * p.aim;
      if (i === 1) {
        rx += (-1.2 - rx) * p.reach;
        ex += (-0.2 - ex) * p.reach;
      }
      a.rotation.set(rx, 0, rz);
      e.rotation.set(ex, 0, 0);
    }
    // (Riders reach forward for the wheel or the bars too: no gun for them.)
    // ---- Golf: the address, the coil and the finish ----
    const gf = p.golf ?? 0;
    if (gf > 0) {
      const sw = p.swing ?? 0;
      const back = Math.max(0, -sw);
      const thru = Math.max(0, sw);
      if (chest.current) {
        chest.current.rotation.x = 0.42 * gf * (1 - thru * 0.6);
        // Turn away on the backswing, through to face the target at the finish.
        chest.current.rotation.y = (back * 1.45 - thru * 1.6) * gf;
      }
      if (hips.current) hips.current.rotation.y = (back * 0.45 - thru * 0.9) * gf;
      if (head.current) head.current.rotation.x = 0.25 * gf * (1 - thru);
      for (let i = 0; i < 2; i++) {
        const s = i ? -1 : 1;
        const a = sh.current[i];
        const e = el.current[i];
        if (a) a.rotation.set(-0.38 - (back + thru) * 1.75, 0, -s * 0.42 * (1 - (back + thru) * 0.3));
        if (e) e.rotation.set(-0.08 - (i === (back > 0 ? 0 : 1) ? (back + thru) * 0.7 : 0), 0, 0);
        const leg = hp.current[i];
        const knee = kn.current[i];
        if (leg) leg.rotation.x = -0.18 * gf;
        if (knee) knee.rotation.x = 0.28 * gf;
      }
    }
    if (club.current) club.current.visible = gf > 0;
    if (gun.current) gun.current.visible = o === "guard" || (p.aim > 0.3 && p.sit < 0.3);
    if (card.current) card.current.visible = o === "guard" && p.keycard;
    if (cuffs.current) cuffs.current.visible = p.cuffed > 0.5;
  });

  /** A hand: palm, four fingers (slightly curled) and a thumb. Palm toward the body, fingers down. */
  const hand = (s: number) => (
    <group position-y={-0.255}>
      <mesh geometry={G.sphere} material={skin} position={[0, -0.045, 0.004]} scale={[0.017, 0.046, 0.041]} castShadow={castShadow} raycast={noRaycast} />
      {[-0.026, -0.009, 0.008, 0.025].map((z, k) => (
        <mesh key={k} geometry={G.finger} material={skin} position={[s * 0.002, -0.082, z]} rotation-x={0.12 + k * 0.03} rotation-z={s * -0.08} scale={[0.0082, 0.042 + (k === 1 || k === 2 ? 0.008 : 0), 0.0082]} raycast={noRaycast} />
      ))}
      <mesh geometry={G.finger} material={skin} position={[-s * 0.01, -0.035, 0.035]} rotation-x={-0.5} rotation-z={s * 0.5} scale={[0.0095, 0.038, 0.0095]} raycast={noRaycast} />
    </group>
  );

  // A limb chain: shoulder → elbow → hand, or hip → knee → foot.
  const arm = (i: number) => {
    const s = i ? -1 : 1;
    return (
      <group
        key={`arm${i}`}
        position={[s * 0.19, 0.385, 0]}
        ref={(gr) => {
          sh.current[i] = gr;
        }}
      >
        {/* The shoulder (deltoid), the upper arm, and the sleeve over it */}
        <mesh geometry={G.sphere} material={shirt} position={[-s * 0.006, -0.008, 0]} scale={[0.05, 0.052, 0.054]} castShadow={castShadow} raycast={noRaycast} />
        {longSleeves ? (
          <mesh geometry={LONG_SLEEVE} material={shirt} castShadow={castShadow} raycast={noRaycast} />
        ) : (
          <>
            <mesh geometry={UPPER_ARM} material={skin} castShadow={castShadow} raycast={noRaycast} />
            <mesh geometry={SLEEVE} material={shirt} castShadow={castShadow} raycast={noRaycast} />
          </>
        )}
        <group
          position={[0, -0.295, 0]}
          ref={(gr) => {
            el.current[i] = gr;
          }}
        >
          <mesh geometry={FOREARM} material={skin} castShadow={castShadow} raycast={noRaycast} />
          {longSleeves && <mesh geometry={FOREARM_SLEEVE} material={shirt} castShadow={castShadow} raycast={noRaycast} />}
          {hand(s)}
          {/* A golf club, held in the right hand: grip, shaft and head */}
          {i === 1 && (
            <group ref={club} position={[0.03, -0.3, 0.02]} rotation={[0.25, 0, -0.55]} visible={false}>
              <mesh geometry={G.cyl} material={dark} position-y={-0.08} scale={[0.012, 0.22, 0.012]} raycast={noRaycast} />
              <mesh geometry={G.cyl} material={mat("#c9ced4", 0.25, 0.9)} position-y={-0.55} scale={[0.0055, 0.78, 0.0055]} raycast={noRaycast} />
              <mesh geometry={G.box} material={mat("#2b2f36", 0.3, 0.8)} position={[0, -0.96, 0.04]} scale={[0.03, 0.05, 0.11]} raycast={noRaycast} />
            </group>
          )}
          {/* The rifle (guards), held in the right hand */}
          {i === 1 && (
            <group ref={gun} position={[0, -0.3, 0.05]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
              <mesh geometry={G.box} material={metal} position={[0, 0.12, 0]} scale={[0.04, 0.5, 0.07]} raycast={noRaycast} />
              <mesh geometry={G.box} material={metal} position={[0, -0.06, -0.06]} scale={[0.035, 0.08, 0.12]} raycast={noRaycast} />
              <mesh geometry={G.cyl} material={metal} position={[0, 0.42, 0.01]} scale={[0.015, 0.2, 0.015]} raycast={noRaycast} />
            </group>
          )}
        </group>
      </group>
    );
  };
  const leg = (i: number) => {
    const s = i ? -1 : 1;
    return (
      <group
        key={`leg${i}`}
        position={[s * 0.092, -0.05, 0]}
        ref={(gr) => {
          hp.current[i] = gr;
        }}
      >
        <mesh geometry={THIGH} material={pants} castShadow={castShadow} raycast={noRaycast} />
        <group
          position={[0, -0.44, 0]}
          ref={(gr) => {
            kn.current[i] = gr;
          }}
        >
          <mesh geometry={SHIN} material={pants} castShadow={castShadow} raycast={noRaycast} />
          {/* The shoe: the upper (round toe, heel counter), the sole, and the laces */}
          <group position={[0, -0.43, 0]}>
            <mesh geometry={G.sphere} material={shoes} position={[0, 0.0, 0.055]} scale={[0.048, 0.04, 0.105]} castShadow={castShadow} raycast={noRaycast} />
            <mesh geometry={G.sphere} material={shoes} position={[0, 0.012, -0.04]} scale={[0.044, 0.05, 0.05]} raycast={noRaycast} />
            <mesh geometry={G.box} material={sole} position={[0, -0.032, 0.03]} scale={[0.1, 0.025, 0.27]} raycast={noRaycast} />
            <mesh geometry={G.box} material={sole} position={[0, 0.032, 0.06]} rotation-x={-0.35} scale={[0.04, 0.006, 0.07]} raycast={noRaycast} />
          </group>
        </group>
      </group>
    );
  };

  const hairPart = useMemo(() => {
    if (style === "bald") return null;
    return (
      <>
        <mesh geometry={HAIR[style]} material={hair} castShadow={castShadow} raycast={noRaycast} />
        {style === "long" && <mesh geometry={G.sphere} material={hair} position={[0, -0.13, -0.06]} scale={[0.075, 0.13, 0.04]} raycast={noRaycast} />}
        {style === "bun" && <mesh geometry={G.sphere} material={hair} position={[0, 0.07, -0.105]} scale={0.04} raycast={noRaycast} />}
      </>
    );
  }, [style, hair, castShadow]);

  return (
    <group scale={S}>
      {/* Further off: a simple figure */}
      <group ref={simple} visible={false}>
        {[-1, 1].map((k) => (
          <mesh key={k} geometry={G.cyl} material={pants} position={[k * 0.09, 0.47, 0]} scale={[0.07, 0.92, 0.075]} castShadow={castShadow} raycast={noRaycast} />
        ))}
        <mesh geometry={TORSO_GEO} material={shirt} position-y={1.05} castShadow={castShadow} raycast={noRaycast} />
        {[-1, 1].map((k) => (
          <mesh key={`a${k}`} geometry={G.cyl} material={longSleeves ? shirt : skin} position={[k * 0.21, 1.17, 0]} scale={[0.04, 0.55, 0.04]} raycast={noRaycast} />
        ))}
        <mesh geometry={HEAD_GEO} material={skin} position-y={1.69} raycast={noRaycast} />
        {style !== "bald" && <mesh geometry={HAIR[style]} material={hair} position-y={1.69} raycast={noRaycast} />}
      </group>
      <group ref={root}>
        <group ref={hips} position-y={0.95}>
          <mesh geometry={PELVIS} material={pants} rotation-z={Math.PI / 2} scale={[1, 1.02, 0.78]} castShadow={castShadow} raycast={noRaycast} />
          {/* Belt, with a buckle */}
          <mesh geometry={G.cyl} material={o === "cop" || o === "guard" ? dark : mat("#3a2d22", 0.6)} position-y={0.075} scale={[0.148, 0.035, 0.112]} raycast={noRaycast} />
          <mesh geometry={G.box} material={mat("#b9b3a5", 0.3, 0.8)} position={[0, 0.075, 0.112]} scale={[0.04, 0.03, 0.008]} raycast={noRaycast} />
          {(o === "cop" || o === "guard") && <mesh geometry={G.box} material={dark} position={[-0.16, 0.02, 0.02]} scale={[0.05, 0.12, 0.08]} raycast={noRaycast} />}
          {/* The guard's keycard, clipped to the belt */}
          <mesh ref={card} geometry={G.box} material={white} position={[0.12, 0.0, 0.1]} rotation-y={0.4} scale={[0.06, 0.085, 0.006]} visible={false} raycast={noRaycast} />
          {leg(0)}
          {leg(1)}
          <group ref={chest} position-y={0.1}>
            <mesh geometry={TORSO_GEO} material={shirt} castShadow={castShadow} raycast={noRaycast} />
            {/* The collar round the neck, and a placket down the front of the shirt */}
            <mesh geometry={G.torus} material={collar} position-y={0.47} rotation-x={Math.PI / 2 - 0.15} scale={[0.064, 0.06, 0.05]} raycast={noRaycast} />
            {o !== "casual" && <mesh geometry={G.box} material={collar} position={[0, 0.3, 0.111]} rotation-x={-0.12} scale={[0.02, 0.32, 0.006]} raycast={noRaycast} />}
            {o === "worker" && <mesh geometry={G.box} material={accent} position={[0, 0.1, 0.112]} scale={[0.25, 0.4, 0.012]} raycast={noRaycast} />}
            {o === "suit" && <mesh geometry={G.box} material={mat(look.accent ?? "#b8323a", 0.5)} position={[0, 0.3, 0.118]} rotation-x={-0.1} scale={[0.035, 0.28, 0.008]} raycast={noRaycast} />}
            {(o === "cop" || o === "guard") && <mesh geometry={G.box} material={gold} position={[-0.085, 0.33, 0.112]} scale={[0.045, 0.055, 0.01]} raycast={noRaycast} />}
            {o === "guard" && <mesh geometry={VEST_GEO} material={mat("#2b2f36", 0.8)} raycast={noRaycast} />}
            {arm(0)}
            {arm(1)}
            {/* Handcuffs */}
            <group ref={cuffs} position={[0, -0.12, -0.2]} visible={false}>
              {[-1, 1].map((k) => (
                <mesh key={k} position-x={k * 0.04} rotation-x={Math.PI / 2} raycast={noRaycast}>
                  <torusGeometry args={[0.035, 0.008, 6, 14]} />
                  <primitive object={mat("#c9d1d9", 0.2, 0.9)} attach="material" />
                </mesh>
              ))}
            </group>
            <mesh geometry={NECK} material={skin} position={[0, 0.465, -0.012]} scale={[0.92, 1, 0.92]} castShadow={castShadow} raycast={noRaycast} />
            <group ref={head} position={[0, 0.638, 0.006]}>
              <mesh geometry={HEAD_GEO} material={skin} castShadow={castShadow} raycast={noRaycast} />
              {/* Ears */}
              {[-1, 1].map((k) => (
                <mesh key={k} geometry={G.ear} material={skin} position={[k * 0.074, -0.005, -0.006]} rotation-y={k * -0.25} scale={[0.02, 0.031, 0.02]} raycast={noRaycast} />
              ))}
              {/* Eyes: whites, irises, pupils, and the upper lids over them */}
              {FACE.eye.map((e, k) => (
                <group key={`e${k}`} position={e}>
                  <mesh geometry={G.sphere} material={white} scale={[0.0118, 0.0118, 0.0108]} raycast={noRaycast} />
                  <mesh geometry={G.sphere} material={iris} position-z={0.0088} scale={[0.0058, 0.0058, 0.0028]} raycast={noRaycast} />
                  <mesh geometry={G.sphere} material={pupil} position-z={0.0105} scale={[0.0026, 0.0026, 0.0012]} raycast={noRaycast} />
                  <mesh geometry={G.lid} material={skin} rotation-x={-0.75} scale={0.0126} raycast={noRaycast} />
                </group>
              ))}
              {/* Eyebrows (a little arched) */}
              {FACE.brow.map((b, k) => (
                <group key={`b${k}`} position={b}>
                  {[-1, 0, 1].map((j) => (
                    <mesh key={j} geometry={G.box} material={hair} position={[j * 0.009, -Math.abs(j) * 0.0022 + (j === (k ? 1 : -1) ? -0.0012 : 0), -Math.abs(j) * 0.0015]} rotation-z={-j * 0.22} scale={[0.011, 0.0042, 0.004]} raycast={noRaycast} />
                  ))}
                </group>
              ))}
              {/* Nostrils, and the lips */}
              {FACE.nostril.map((n, k) => (
                <mesh key={`n${k}`} geometry={G.sphere} material={nostril} position={n} scale={[0.004, 0.0025, 0.003]} raycast={noRaycast} />
              ))}
              <mesh geometry={G.lip} material={lips} position={FACE.upperLip} scale={[0.0085, 0.0042, 0.0045]} raycast={noRaycast} />
              <mesh geometry={G.lip} material={lips} position={FACE.lowerLip} scale={[0.0075, 0.0052, 0.0055]} raycast={noRaycast} />
              {hairPart}
              {/* Hats: police cap, worker cap */}
              {o === "cop" && (
                <group position-y={0.085}>
                  <mesh geometry={G.cyl} material={mat(look.accent ?? "#1d2b4f", 0.6)} scale={[0.085, 0.05, 0.1]} raycast={noRaycast} />
                  <mesh geometry={G.box} material={dark} position={[0, -0.02, 0.1]} rotation-x={0.25} scale={[0.13, 0.008, 0.07]} raycast={noRaycast} />
                  <mesh geometry={G.box} material={gold} position={[0, 0.005, 0.1]} scale={[0.025, 0.025, 0.004]} raycast={noRaycast} />
                </group>
              )}
              {o === "worker" && (
                <group position-y={0.075}>
                  <mesh geometry={G.cyl} material={accent} scale={[0.082, 0.038, 0.098]} raycast={noRaycast} />
                  <mesh geometry={G.box} material={accent} position={[0, -0.018, 0.1]} scale={[0.12, 0.008, 0.07]} raycast={noRaycast} />
                </group>
              )}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

/** Random everyday looks for people out and about (seeded, so they don't change). */
const SKINS = ["#f1c7a5", "#e0ac83", "#c98e62", "#a86b45", "#8d5a3b", "#5e3a24"];
const HAIRS = ["#1b1410", "#2a1a12", "#4a2e1c", "#6b4423", "#a87b4f", "#d6b26e", "#8a8a8a"];
const SHIRTS = ["#8c2f2a", "#2f6f6a", "#c9a548", "#3b5c8f", "#b5653a", "#5b4a7a", "#2d4f3f", "#e9e6df", "#7a2a2a", "#c98f9b", "#1d3557", "#6f8a52", "#2b2f36", "#8f969d"];
const PANTS = ["#2b2f36", "#3a4150", "#5b3a26", "#1f3b5c", "#6b6b6b", "#c9b48a", "#1b1d21"];
const STYLES: Look["hairStyle"][] = ["short", "long", "buzz", "bun", "short", "bald"];

export function randomLook(seed: number, extra: Partial<Look> = {}): Look {
  let n = seed * 9301 + 49297;
  const r = () => ((n = (n * 16807) % 2147483647) / 2147483647);
  r();
  return {
    skin: SKINS[Math.floor(r() * SKINS.length)],
    hair: HAIRS[Math.floor(r() * HAIRS.length)],
    hairStyle: STYLES[Math.floor(r() * STYLES.length)],
    shirt: SHIRTS[Math.floor(r() * SHIRTS.length)],
    pants: PANTS[Math.floor(r() * PANTS.length)],
    ...extra,
  };
}

/** You (the player). */
export const PLAYER_LOOK: Look = { skin: "#e0ac83", hair: "#2a1a12", hairStyle: "short", shirt: "#3d6fe0", pants: "#2b2f36", shoes: "#f2f2f2" };

/** Uniforms. */
export const COP_LOOK: Look = { skin: "#c98e62", hair: "#1b1410", hairStyle: "buzz", shirt: "#26385e", pants: "#1d2b4f", outfit: "cop", accent: "#1d2b4f" };
export const GUARD_LOOK: Look = { skin: "#e0ac83", hair: "#2a1a12", hairStyle: "buzz", shirt: "#4a4f57", pants: "#2f3338", outfit: "guard" };
export const PRISONER_LOOK = (base: Look): Look => ({ ...base, shirt: "#ff7a1a", pants: "#ff7a1a", shoes: "#f2f2f2", outfit: "prisoner" });
