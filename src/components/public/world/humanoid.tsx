"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { noRaycast } from "./paint";

/*
 * A person, built to real proportions out of rounded parts (capsules and
 * spheres): head with eyes, brows and nose, hair, neck, torso, arms with
 * elbows and hands, legs with knees and shoes. It walks with bending knees
 * and swinging arms, runs, jumps, puts its hands up, gets handcuffed, sits,
 * holds a gun, or falls over. Outfits: everyday clothes, police uniform,
 * prison guard (with a rifle and a keycard on the belt), shop uniform with an
 * apron, suit, or an orange prison jumpsuit.
 *
 * Whoever owns a Humanoid fills in its `pose` every frame; the model reads it.
 * Standing height is HUMAN_HEIGHT world units (you're the same size).
 */

export const HUMAN_HEIGHT = 3.35;
/** Built in metres (1.8 m tall), then scaled up to world units. */
const S = HUMAN_HEIGHT / 1.82;

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
  /** Holding a gun out in front. */
  aim: number;
  /** Lying on the ground (0…1). */
  down: number;
  /** Reaching out (pickpocketing, handing over food…). */
  reach: number;
  /** The keycard on the belt (guards) is there. */
  keycard: boolean;
};

export const newPose = (): Pose => ({ phase: 0, gait: 0, handsUp: 0, cuffed: 0, sit: 0, air: 0, aim: 0, down: 0, reach: 0, keycard: true });

// One material per colour, shared by everyone.
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
// Shared shapes.
const G = {
  limb: (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10).translate(0, -len / 2 - r * 0.2, 0),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
};
const UPPER_ARM = G.limb(0.052, 0.22);
const FOREARM = G.limb(0.046, 0.2);
const THIGH = G.limb(0.078, 0.33);
const SHIN = G.limb(0.06, 0.34);
const TORSO = new THREE.CapsuleGeometry(0.155, 0.3, 6, 14);
const PELVIS = new THREE.CapsuleGeometry(0.14, 0.08, 4, 12);
const HAIR_CAP = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);

export function Humanoid({ look, pose, castShadow = true }: { look: Look; pose: Pose; castShadow?: boolean }) {
  const root = useRef<THREE.Group>(null);
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

  const o = look.outfit ?? "casual";
  const skin = mat(look.skin, 0.6);
  const shirt = mat(look.shirt, o === "suit" ? 0.5 : 0.85);
  const pants = mat(look.pants, 0.8);
  const shoes = mat(look.shoes ?? (o === "casual" ? "#f2f2f2" : "#1b1d21"), 0.5);
  const hair = mat(look.hair, 0.7);
  const dark = mat("#1b1d21", 0.4);
  const white = mat("#ffffff", 0.3);
  const gold = mat("#d4a72c", 0.35, 0.8);
  const metal = mat("#2a2e33", 0.35, 0.7);
  const accent = mat(look.accent ?? "#e5483b", 0.8);
  const longSleeves = o !== "casual" && o !== "worker";
  const style = look.hairStyle ?? "short";

  useFrame(() => {
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
      chest.current.rotation.x = run * 0.25 + p.reach * 0.25;
      chest.current.rotation.y = -swing * 0.12 * walk;
    }
    if (root.current) {
      root.current.rotation.x = -p.down * Math.PI * 0.5;
      root.current.position.y = p.down * 0.25;
    }
    if (head.current) head.current.rotation.x = -run * 0.15 + p.cuffed * 0.25;
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
      let rz = s * 0.08;
      let ex = -0.25 - run * 0.9 * walk;
      // Hands up.
      rx += (-Math.PI * 0.95 - rx) * p.handsUp;
      rz += (s * 0.35 - rz) * p.handsUp;
      ex += (-0.15 - ex) * p.handsUp;
      // Cuffed: arms behind the back, hands together.
      rx += (0.55 - rx) * p.cuffed;
      rz += (-s * 0.25 - rz) * p.cuffed;
      ex += (-0.9 - ex) * p.cuffed;
      // Aiming: both arms forward.
      rx += (-1.45 - rx) * p.aim;
      rz += (-s * 0.25 - rz) * p.aim;
      ex += (-0.1 - ex) * p.aim;
      // Reaching (right arm only).
      if (i === 1) {
        rx += (-1.2 - rx) * p.reach;
        ex += (-0.2 - ex) * p.reach;
      }
      a.rotation.set(rx, 0, rz);
      e.rotation.set(ex, 0, 0);
    }
    if (gun.current) gun.current.visible = o === "guard" || p.aim > 0.3;
    if (card.current) card.current.visible = o === "guard" && p.keycard;
    if (cuffs.current) cuffs.current.visible = p.cuffed > 0.5;
  });

  // A limb chain: shoulder → elbow, or hip → knee.
  const arm = (i: number) => {
    const s = i ? -1 : 1;
    return (
      <group
        key={`arm${i}`}
        position={[s * 0.215, 0.18, 0]}
        ref={(gr) => {
          sh.current[i] = gr;
        }}
      >
        <mesh geometry={UPPER_ARM} material={shirt} castShadow={castShadow} raycast={noRaycast} />
        <group
          position={[0, -0.29, 0]}
          ref={(gr) => {
            el.current[i] = gr;
          }}
        >
          <mesh geometry={FOREARM} material={longSleeves ? shirt : skin} castShadow={castShadow} raycast={noRaycast} />
          <mesh geometry={G.sphere} material={skin} position={[0, -0.27, 0.01]} scale={[0.045, 0.055, 0.03]} raycast={noRaycast} />
          {/* The rifle (guards), held in the right hand */}
          {i === 1 && (
            <group ref={gun} position={[0, -0.27, 0.05]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
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
        position={[s * 0.095, -0.05, 0]}
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
          <mesh geometry={G.box} material={shoes} position={[0, -0.43, 0.04]} scale={[0.1, 0.08, 0.26]} castShadow={castShadow} raycast={noRaycast} />
        </group>
      </group>
    );
  };

  const hairParts = useMemo(() => {
    if (style === "bald") return null;
    return (
      <>
        <mesh geometry={HAIR_CAP} material={hair} position={[0, 0.02, -0.005]} scale={style === "buzz" ? [0.112, 0.12, 0.122] : [0.122, 0.13, 0.13]} raycast={noRaycast} />
        {style === "long" && <mesh geometry={G.box} material={hair} position={[0, -0.09, -0.07]} scale={[0.22, 0.26, 0.08]} raycast={noRaycast} />}
        {style === "bun" && <mesh geometry={G.sphere} material={hair} position={[0, 0.1, -0.1]} scale={0.055} raycast={noRaycast} />}
      </>
    );
  }, [style, hair]);

  return (
    <group scale={S}>
      <group ref={root}>
        <group ref={hips} position-y={0.95}>
          <mesh geometry={PELVIS} material={pants} rotation-z={Math.PI / 2} scale={[1, 1.05, 0.85]} castShadow={castShadow} raycast={noRaycast} />
          {/* Belt */}
          <mesh geometry={G.cyl} material={o === "cop" || o === "guard" ? dark : mat("#3a2d22", 0.6)} position-y={0.07} scale={[0.155, 0.035, 0.125]} raycast={noRaycast} />
          {(o === "cop" || o === "guard") && <mesh geometry={G.box} material={dark} position={[-0.16, 0.02, 0.02]} scale={[0.05, 0.12, 0.08]} raycast={noRaycast} />}
          {/* The guard's keycard, clipped to the belt */}
          <mesh ref={card} geometry={G.box} material={white} position={[0.12, 0.0, 0.11]} rotation-y={0.4} scale={[0.06, 0.085, 0.006]} visible={false} raycast={noRaycast} />
          {leg(0)}
          {leg(1)}
          <group ref={chest} position-y={0.1}>
            <mesh geometry={TORSO} material={shirt} position-y={0.24} scale={[1.18, 1, 0.78]} castShadow={castShadow} raycast={noRaycast} />
            {o === "worker" && <mesh geometry={G.box} material={accent} position={[0, 0.12, 0.12]} scale={[0.26, 0.42, 0.02]} raycast={noRaycast} />}
            {o === "suit" && <mesh geometry={G.box} material={mat(look.accent ?? "#b8323a", 0.5)} position={[0, 0.3, 0.125]} scale={[0.04, 0.26, 0.01]} raycast={noRaycast} />}
            {(o === "cop" || o === "guard") && <mesh geometry={G.box} material={gold} position={[-0.09, 0.36, 0.125]} scale={[0.045, 0.055, 0.01]} raycast={noRaycast} />}
            {o === "guard" && <mesh geometry={G.box} material={mat("#2b2f36", 0.8)} position={[0, 0.28, 0]} scale={[0.37, 0.4, 0.27]} raycast={noRaycast} />}
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
            <mesh geometry={G.cyl} material={skin} position-y={0.47} scale={[0.05, 0.08, 0.05]} raycast={noRaycast} />
            <group ref={head} position-y={0.6}>
              <mesh geometry={G.sphere} material={skin} scale={[0.105, 0.125, 0.115]} castShadow={castShadow} raycast={noRaycast} />
              {/* Ears, nose */}
              {[-1, 1].map((k) => (
                <mesh key={k} geometry={G.sphere} material={skin} position={[k * 0.103, 0, 0]} scale={[0.018, 0.03, 0.022]} raycast={noRaycast} />
              ))}
              <mesh geometry={G.sphere} material={skin} position={[0, -0.01, 0.112]} scale={[0.018, 0.028, 0.022]} raycast={noRaycast} />
              {/* Eyes and eyebrows */}
              {[-1, 1].map((k) => (
                <group key={`e${k}`} position={[k * 0.04, 0.025, 0.098]}>
                  <mesh geometry={G.sphere} material={white} scale={[0.017, 0.012, 0.01]} raycast={noRaycast} />
                  <mesh geometry={G.sphere} material={dark} position-z={0.007} scale={0.0075} raycast={noRaycast} />
                  <mesh geometry={G.box} material={hair} position={[0, 0.025, 0.004]} rotation-z={k * -0.12} scale={[0.035, 0.007, 0.006]} raycast={noRaycast} />
                </group>
              ))}
              <mesh geometry={G.box} material={mat("#a8544a", 0.6)} position={[0, -0.058, 0.103]} scale={[0.04, 0.007, 0.005]} raycast={noRaycast} />
              {hairParts}
              {/* Hats: police cap, worker visor */}
              {o === "cop" && (
                <group position-y={0.09}>
                  <mesh geometry={G.cyl} material={mat(look.accent ?? "#1d2b4f", 0.6)} scale={[0.12, 0.06, 0.125]} raycast={noRaycast} />
                  <mesh geometry={G.box} material={dark} position={[0, -0.025, 0.12]} rotation-x={0.25} scale={[0.17, 0.01, 0.09]} raycast={noRaycast} />
                  <mesh geometry={G.box} material={gold} position={[0, 0.005, 0.124]} scale={[0.03, 0.03, 0.004]} raycast={noRaycast} />
                </group>
              )}
              {o === "worker" && (
                <group position-y={0.075}>
                  <mesh geometry={G.cyl} material={accent} scale={[0.118, 0.045, 0.122]} raycast={noRaycast} />
                  <mesh geometry={G.box} material={accent} position={[0, -0.02, 0.12]} scale={[0.16, 0.01, 0.08]} raycast={noRaycast} />
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
const SHIRTS = ["#e5483b", "#13a8a0", "#ffd21f", "#3d6fe0", "#ff7a2a", "#7b5cd6", "#2d6a4f", "#f2f0ea", "#c0392b", "#ff8fab", "#1d4f91", "#90be6d", "#2b2f36", "#9aa3ad"];
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
