"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { YellowLetters } from "./fixtures";
import { WitchHat } from "./halloween";
import { noRaycast, signTexture } from "./paint";
import { REQUEST_DESK } from "./world-layout";

/*
 * The request table, front left in the store. Built in its own little space
 * where +z points at the customer: the table, someone sitting behind it
 * typing on a computer (and now and then sipping a warm coffee), papers
 * scattered about, a desk lamp, and "REQUEST ITEMS" floating overhead.
 * Tapping it walks you over; tapping it again opens the request form.
 */

const TOP = 2.65; // table top height
const SEAT = 1.65; // where the clerk sits
const SHOULDER_Y = 3.55;
const SHOULDER_HALF = 0.62;
const ARM = 1.0; // each half of an arm
const CLERK_Z = -1.75;
const MUG_HOME = new THREE.Vector3(1.35, TOP + 0.02, -0.25);
const MOUTH = new THREE.Vector3(0.15, 4.0, CLERK_Z + 0.55);
const UP = new THREE.Vector3(0, 1, 0);
const GRIP = new THREE.Vector3(0.12, 0.25, 0); // where the hand holds the mug

/** Puts a 1-tall cylinder between two points. */
function stretch(
  mesh: THREE.Object3D | null,
  a: THREE.Vector3,
  b: THREE.Vector3,
  dir: THREE.Vector3,
) {
  if (!mesh) return;
  dir.subVectors(b, a);
  const len = dir.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
}

/** Shoulder → hand, bending the elbow outward and down. */
function solveArm(
  shoulder: THREE.Vector3,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  elbow: THREE.Vector3,
  hand: THREE.Vector3,
) {
  const dir = new THREE.Vector3().subVectors(target, shoulder);
  const d = THREE.MathUtils.clamp(dir.length(), 0.3, ARM * 2 - 0.001);
  dir.normalize();
  hand.copy(shoulder).addScaledVector(dir, d);
  const bend = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  elbow
    .copy(shoulder)
    .addScaledVector(dir, d / 2)
    .addScaledVector(bend, Math.sqrt(Math.max(0, ARM * ARM - (d / 2) ** 2)));
}

export function RequestDesk({
  near,
  calm,
  halloween,
  onOpen,
}: {
  /** You're standing at the table. */
  near: boolean;
  calm: boolean;
  halloween: boolean;
  onOpen: () => void;
}) {
  return (
    <group
      position={[REQUEST_DESK.x, 0, REQUEST_DESK.z]}
      rotation-y={REQUEST_DESK.turn}
    >
      <group
        onClick={(e) => {
          if (e.delta > 8) return;
          e.stopPropagation();
          onOpen();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <Table />
        <Chair />
        <Computer />
        <Papers />
        <Lamp />
        <ClerkAndCoffee near={near} calm={calm} halloween={halloween} />
      </group>

      {/* Floating letters over the table */}
      <group position={[0, 7.4, -0.6]}>
        <YellowLetters text="REQUEST ITEMS" size={0.82} />
      </group>
    </group>
  );
}

// ---- The table ---------------------------------------------------------------------------------

function Table() {
  const sign = signTexture("Tell us what to stock!", {
    bg: "#0b6b67",
    fg: "#ffffff",
    height: 96,
  });
  const wood = <meshStandardMaterial color="#b47a46" roughness={0.55} />;
  return (
    <group>
      {/* Top, with a darker edge */}
      <RoundedBox
        args={[4.8, 0.18, 2.3]}
        radius={0.05}
        position-y={TOP - 0.09}
        castShadow
        receiveShadow
      >
        {wood}
      </RoundedBox>
      {/* Legs */}
      {[-2.2, 2.2].flatMap((x) =>
        [-0.95, 0.95].map((z) => (
          <mesh key={`${x}${z}`} position={[x, (TOP - 0.18) / 2, z]} castShadow>
            <boxGeometry args={[0.16, TOP - 0.18, 0.16]} />
            <meshStandardMaterial color="#7c5230" roughness={0.6} />
          </mesh>
        )),
      )}
      {/* Front panel with the sign, facing the customer */}
      <mesh position={[0, 1.45, 1.06]} castShadow>
        <boxGeometry args={[4.5, 1.9, 0.08]} />
        <meshStandardMaterial color="#e9dcc3" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.6, 1.105]} raycast={noRaycast}>
        <planeGeometry args={[3.6, 3.6 / sign.aspect]} />
        <meshBasicMaterial map={sign.texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Chair() {
  const dark = <meshStandardMaterial color="#2b2f36" roughness={0.6} />;
  return (
    <group position={[0, 0, CLERK_Z - 0.05]}>
      <RoundedBox
        args={[1.3, 0.22, 1.2]}
        radius={0.08}
        position-y={SEAT - 0.12}
        castShadow
      >
        {dark}
      </RoundedBox>
      <RoundedBox
        args={[1.25, 1.5, 0.18]}
        radius={0.08}
        position={[0, SEAT + 0.85, -0.62]}
        rotation-x={-0.08}
        castShadow
      >
        {dark}
      </RoundedBox>
      <mesh position-y={SEAT / 2} raycast={noRaycast}>
        <cylinderGeometry args={[0.07, 0.07, SEAT - 0.2, 10]} />
        <meshStandardMaterial color="#9aa0a6" metalness={0.6} roughness={0.3} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[
            Math.sin((i / 5) * Math.PI * 2) * 0.45,
            0.12,
            Math.cos((i / 5) * Math.PI * 2) * 0.45,
          ]}
          rotation-y={(i / 5) * Math.PI * 2}
          raycast={noRaycast}
        >
          <boxGeometry args={[0.1, 0.08, 0.9]} />
          {dark}
        </mesh>
      ))}
    </group>
  );
}

// ---- Computer ----------------------------------------------------------------------------------

/** What's on the screen: a list of requests, like a spreadsheet. */
function screenTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f7fb";
  g.fillRect(0, 0, 512, 320);
  g.fillStyle = "#0b6b67";
  g.fillRect(0, 0, 512, 46);
  g.fillStyle = "#fff";
  g.font = "bold 26px sans-serif";
  g.fillText("Item requests", 18, 32);
  const rows = [
    "Takis Blue Heat",
    "Gatorade Zero",
    "Hot Fries",
    "Sour Strips",
    "Cup Noodles",
    "Arizona Tea",
  ];
  rows.forEach((r, i) => {
    const y = 64 + i * 42;
    g.fillStyle = i % 2 ? "#e8eef5" : "#ffffff";
    g.fillRect(10, y, 492, 38);
    g.fillStyle = "#1d2433";
    g.font = "22px sans-serif";
    g.fillText(r, 22, y + 26);
    g.fillStyle = "#ff5a1f";
    g.fillRect(360, y + 10, 120 - i * 16, 18);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Computer() {
  const screen = useMemo(() => screenTexture(), []);
  const plastic = <meshStandardMaterial color="#1f2329" roughness={0.45} />;
  return (
    <group>
      {/* The monitor, off to one side and turned to face the clerk (so you can see them past it) */}
      <group
        position={[-1.0, TOP, -0.4]}
        rotation-y={Math.atan2(1.0, CLERK_Z + 0.4)}
      >
        <mesh position-y={0.04} raycast={noRaycast}>
          <boxGeometry args={[0.6, 0.06, 0.45]} />
          {plastic}
        </mesh>
        <mesh position-y={0.35} raycast={noRaycast}>
          <boxGeometry args={[0.1, 0.6, 0.08]} />
          {plastic}
        </mesh>
        <RoundedBox
          args={[1.7, 1.08, 0.09]}
          radius={0.04}
          position={[0, 0.95, 0]}
          castShadow
        >
          {plastic}
        </RoundedBox>
        <mesh position={[0, 0.97, 0.05]} raycast={noRaycast}>
          <planeGeometry args={[1.56, 0.95]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
        {/* Screen glow on the clerk's face */}
        <pointLight
          position={[0, 1, 0.6]}
          intensity={1.6}
          distance={2.6}
          color="#cfe6ff"
        />
      </group>
      {/* Keyboard, in front of the clerk */}
      <RoundedBox
        args={[1.25, 0.06, 0.42]}
        radius={0.02}
        position={[0, TOP + 0.04, -0.62]}
        raycast={noRaycast}
      >
        <meshStandardMaterial color="#e7e9ec" roughness={0.6} />
      </RoundedBox>
    </group>
  );
}

// ---- Papers, pen, sticky notes ---------------------------------------------------------------

/** A sheet of paper with a few lines of scribbled handwriting. */
function paperTexture(seed: number, form: boolean) {
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 248;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fbfaf6";
  g.fillRect(0, 0, 192, 248);
  let s = seed * 97 + 13;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  if (form) {
    g.fillStyle = "#0b6b67";
    g.font = "bold 20px sans-serif";
    g.fillText("REQUEST", 16, 30);
  }
  g.strokeStyle = form ? "#c9d4e2" : "#d9e2ee";
  for (let y = 50; y < 240; y += 18) {
    g.beginPath();
    g.moveTo(12, y);
    g.lineTo(180, y);
    g.stroke();
  }
  // Scribbles in blue pen
  g.strokeStyle = "#2448a8";
  g.lineWidth = 1.6;
  for (let y = 46; y < 200; y += 18) {
    if (rand() < 0.25) continue;
    g.beginPath();
    let x = 16;
    g.moveTo(x, y);
    const end = 60 + rand() * 110;
    while (x < end) {
      x += 4 + rand() * 4;
      g.lineTo(x, y - 2 - rand() * 7);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function Papers() {
  const sheets = useMemo(
    () =>
      [
        { x: 0.75, z: 0.55, r: 0.35, form: true },
        { x: 0.35, z: 0.75, r: -0.5, form: false },
        { x: -1.7, z: 0.45, r: 0.15, form: true },
        { x: -1.4, z: 0.75, r: 0.9, form: false },
        { x: 1.85, z: 0.6, r: -0.25, form: false },
        { x: 0.95, z: 0.85, r: 1.2, form: true },
      ].map((p, i) => ({
        ...p,
        y: TOP + 0.005 + i * 0.004,
        map: paperTexture(i + 3, p.form),
      })),
    [],
  );
  return (
    <group>
      {sheets.map((p, i) => (
        <mesh
          key={i}
          position={[p.x, p.y, p.z]}
          rotation={[-Math.PI / 2, 0, p.r]}
          raycast={noRaycast}
          receiveShadow
        >
          <planeGeometry args={[0.62, 0.8]} />
          <meshStandardMaterial map={p.map} roughness={0.9} />
        </mesh>
      ))}
      {/* A pen lying on the papers */}
      <mesh
        position={[0.55, TOP + 0.05, 0.6]}
        rotation={[0, 0.7, Math.PI / 2]}
        raycast={noRaycast}
      >
        <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
        <meshStandardMaterial color="#2448a8" roughness={0.4} />
      </mesh>
      {/* Sticky notes */}
      {[
        [-0.2, 0.85, 0.2, "#ffe066"],
        [-0.05, 0.95, -0.3, "#ff9fc4"],
      ].map(([x, z, r, color], i) => (
        <mesh
          key={i}
          position={[x as number, TOP + 0.03 + i * 0.004, z as number]}
          rotation={[-Math.PI / 2, 0, r as number]}
          raycast={noRaycast}
        >
          <planeGeometry args={[0.32, 0.32]} />
          <meshStandardMaterial color={color as string} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** A warm desk lamp at the end of the table. */
function Lamp() {
  const metal = (
    <meshStandardMaterial color="#e2b23a" metalness={0.5} roughness={0.35} />
  );
  return (
    <group position={[2.0, TOP, -0.65]} rotation-y={-0.6}>
      <mesh position-y={0.05} raycast={noRaycast}>
        <cylinderGeometry args={[0.22, 0.26, 0.08, 18]} />
        {metal}
      </mesh>
      <mesh position={[0, 0.55, 0.1]} rotation-x={0.25} raycast={noRaycast}>
        <cylinderGeometry args={[0.03, 0.03, 1.0, 8]} />
        {metal}
      </mesh>
      <mesh position={[0, 1.05, 0.38]} rotation-x={2.2} raycast={noRaycast}>
        <coneGeometry args={[0.28, 0.4, 18, 1, true]} />
        <meshStandardMaterial
          color="#e2b23a"
          metalness={0.5}
          roughness={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.95, 0.47]} raycast={noRaycast}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshBasicMaterial color="#fff2c4" toneMapped={false} />
      </mesh>
      <pointLight
        position={[0, 0.8, 0.55]}
        intensity={6}
        distance={4.5}
        decay={1.6}
        color="#ffc98a"
      />
    </group>
  );
}

// ---- The clerk (and the coffee they keep sipping) -----------------------------------------------

/** A wisp of steam: a wavy tube that rises and fades. */
function steamGeometry(phase: number) {
  const pts = Array.from(
    { length: 8 },
    (_, i) =>
      new THREE.Vector3(
        Math.sin(i * 0.9 + phase) * 0.05,
        i * 0.08,
        Math.cos(i * 0.7 + phase) * 0.03,
      ),
  );
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts),
    24,
    0.03,
    6,
    false,
  );
}

function ClerkAndCoffee({
  near,
  calm,
  halloween,
}: {
  near: boolean;
  calm: boolean;
  halloween: boolean;
}) {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const mug = useRef<THREE.Group>(null);
  const steam = useRef<THREE.Group>(null);
  const rUpper = useRef<THREE.Mesh>(null);
  const rLower = useRef<THREE.Mesh>(null);
  const rHand = useRef<THREE.Mesh>(null);
  const lUpper = useRef<THREE.Mesh>(null);
  const lLower = useRef<THREE.Mesh>(null);
  const lHand = useRef<THREE.Mesh>(null);
  const waveFrom = useRef<number | null>(null);
  const wasNear = useRef(false);
  const tag = signTexture("Ash", {
    bg: "#ffffff",
    fg: "#111111",
    height: 64,
    pad: 0.5,
    upper: false,
  });
  const steams = useMemo(() => [0, 2.1, 4.2].map(steamGeometry), []);
  const v = useMemo(
    () => ({
      rs: new THREE.Vector3(SHOULDER_HALF, SHOULDER_Y, CLERK_Z),
      ls: new THREE.Vector3(-SHOULDER_HALF, SHOULDER_Y, CLERK_Z),
      re: new THREE.Vector3(),
      le: new THREE.Vector3(),
      rh: new THREE.Vector3(),
      lh: new THREE.Vector3(),
      rt: new THREE.Vector3(),
      lt: new THREE.Vector3(),
      d: new THREE.Vector3(),
      mugAt: new THREE.Vector3().copy(MUG_HOME),
      poleR: new THREE.Vector3(0.7, -1, -0.3),
      poleL: new THREE.Vector3(-0.7, -1, -0.3),
    }),
    [],
  );

  useFrame((state, delta) => {
    const t = calm ? 0 : state.clock.elapsedTime;
    // Wave hello once when you walk up.
    if (near && !wasNear.current) waveFrom.current = t;
    wasNear.current = near;
    const waving =
      waveFrom.current !== null && t - waveFrom.current < 1.8 && !calm;

    // A 12-second loop: type, reach for the coffee, sip, put it back, type.
    const loop = calm ? 0 : t % 12;
    const sip =
      loop > 8
        ? Math.min(1, (loop - 8) / 0.8) *
          (loop < 11 ? 1 : Math.max(0, 1 - (loop - 11) / 0.8))
        : 0; // 0 → at the desk, 1 → at the mouth
    const holding = loop > 7.4 && loop < 11.9;

    // Typing: both hands on the keyboard, tapping in turn.
    const tapR = calm ? 0 : Math.max(0, Math.sin(t * 13)) * 0.06;
    const tapL = calm ? 0 : Math.max(0, Math.sin(t * 13 + 2.2)) * 0.06;
    v.rt.set(0.32, TOP + 0.14 + tapR, -0.62);
    v.lt.set(-0.32, TOP + 0.14 + tapL, -0.62);

    // Right hand: to the mug, then the mug up to the mouth.
    if (holding) {
      const reach =
        Math.min(1, (loop - 7.4) / 0.6) *
        (loop < 11.3 ? 1 : Math.max(0, 1 - (loop - 11.3) / 0.6));
      v.mugAt.copy(MUG_HOME).lerp(MOUTH, sip);
      v.d.copy(v.mugAt).add(GRIP);
      v.rt.lerp(v.d, reach);
    } else {
      v.mugAt.copy(MUG_HOME);
    }
    // Left hand: waves when you walk up.
    if (waving)
      v.lt.set(-0.9 + Math.sin(t * 10) * 0.25, SHOULDER_Y + 1.1, CLERK_Z + 0.5);

    solveArm(v.rs, v.rt, v.poleR, v.re, v.rh);
    solveArm(v.ls, v.lt, v.poleL, v.le, v.lh);
    stretch(rUpper.current, v.rs, v.re, v.d);
    stretch(rLower.current, v.re, v.rh, v.d);
    stretch(lUpper.current, v.ls, v.le, v.d);
    stretch(lLower.current, v.le, v.lh, v.d);
    rHand.current?.position.copy(v.rh);
    lHand.current?.position.copy(v.lh);

    if (mug.current) {
      mug.current.position.copy(v.mugAt);
      mug.current.rotation.z = sip * 0.5; // tip it to drink
    }
    if (body.current)
      body.current.position.y = calm ? 0 : Math.sin(t * 1.4) * 0.015;
    if (head.current) {
      // Look at the screen; look up at you when you're here; tip back to sip.
      const lookYaw = near ? 0 : -0.35 + Math.sin(t * 0.4) * 0.08;
      head.current.rotation.y = THREE.MathUtils.damp(
        head.current.rotation.y,
        lookYaw,
        5,
        delta,
      );
      head.current.rotation.x = THREE.MathUtils.damp(
        head.current.rotation.x,
        near ? -0.05 : 0.18 - sip * 0.35,
        5,
        delta,
      );
    }
    // Steam drifts up and fades (and follows the mug).
    steam.current?.children.forEach((child, i) => {
      const k = (((t * 0.35 + i / 3) % 1) + 1) % 1;
      child.position.set(Math.sin(t + i) * 0.04, 0.42 + k * 0.5, 0);
      const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = Math.min(1, k * 4) * (1 - k) * 0.95 * (1 - sip);
    });
  });

  const skin = <meshStandardMaterial color="#e0ac83" roughness={0.6} />;
  const sweater = <meshStandardMaterial color="#d9a441" roughness={0.85} />;
  const pants = <meshStandardMaterial color="#3a4150" roughness={0.8} />;
  const hair = <meshStandardMaterial color="#2a1a12" roughness={0.7} />;

  return (
    <group>
      <group ref={body} position={[0, 0, CLERK_Z]}>
        {/* Legs: thighs on the chair, shins down to the floor */}
        {[-0.24, 0.24].map((x) => (
          <group key={x} position-x={x}>
            <mesh
              position={[0, SEAT + 0.12, 0.5]}
              rotation-x={Math.PI / 2}
              raycast={noRaycast}
            >
              <cylinderGeometry args={[0.18, 0.17, 1.05, 12]} />
              {pants}
            </mesh>
            <mesh position={[0, (SEAT + 0.1) / 2, 1.0]} raycast={noRaycast}>
              <cylinderGeometry args={[0.15, 0.14, SEAT + 0.1, 12]} />
              {pants}
            </mesh>
            <RoundedBox
              args={[0.3, 0.2, 0.5]}
              radius={0.08}
              position={[0, 0.1, 1.1]}
              raycast={noRaycast}
            >
              <meshStandardMaterial color="#5b3a26" roughness={0.6} />
            </RoundedBox>
          </group>
        ))}
        {/* Body: mustard sweater and a name tag */}
        <RoundedBox
          args={[1.12, 1.9, 0.62]}
          radius={0.24}
          position-y={SEAT + 1.05}
          raycast={noRaycast}
        >
          {sweater}
        </RoundedBox>
        <mesh position={[0.26, SEAT + 1.45, 0.32]} raycast={noRaycast}>
          <planeGeometry args={[0.3, 0.3 / tag.aspect]} />
          <meshBasicMaterial map={tag.texture} toneMapped={false} />
        </mesh>
        {[-SHOULDER_HALF, SHOULDER_HALF].map((x) => (
          <mesh key={x} position={[x, SHOULDER_Y, 0]} raycast={noRaycast}>
            <sphereGeometry args={[0.2, 14, 10]} />
            {sweater}
          </mesh>
        ))}
        <mesh position-y={SHOULDER_Y + 0.22} raycast={noRaycast}>
          <cylinderGeometry args={[0.13, 0.15, 0.3, 12]} />
          {skin}
        </mesh>
        {/* Head: glasses and a bun */}
        <group ref={head} position-y={SHOULDER_Y + 0.68}>
          <mesh raycast={noRaycast}>
            <sphereGeometry args={[0.42, 24, 18]} />
            {skin}
          </mesh>
          <mesh
            position={[0, 0.1, -0.04]}
            scale={[1.04, 1, 1.04]}
            raycast={noRaycast}
          >
            <sphereGeometry
              args={[0.42, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2.1]}
            />
            {hair}
          </mesh>
          <mesh position={[0, 0.38, -0.26]} raycast={noRaycast}>
            <sphereGeometry args={[0.2, 16, 12]} />
            {hair}
          </mesh>
          {[-0.15, 0.15].map((x) => (
            <group key={x}>
              <mesh position={[x, 0.04, 0.39]} raycast={noRaycast}>
                <sphereGeometry args={[0.045, 10, 8]} />
                <meshStandardMaterial color="#1a1a1a" />
              </mesh>
              <mesh position={[x, 0.04, 0.41]} raycast={noRaycast}>
                <torusGeometry args={[0.1, 0.018, 6, 20]} />
                <meshStandardMaterial color="#1a1a1a" />
              </mesh>
            </group>
          ))}
          <mesh
            position={[0, 0.04, 0.42]}
            rotation-z={Math.PI / 2}
            raycast={noRaycast}
          >
            <cylinderGeometry args={[0.012, 0.012, 0.1, 6]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh
            position={[0, -0.13, 0.38]}
            rotation-z={Math.PI}
            raycast={noRaycast}
          >
            <torusGeometry args={[0.11, 0.02, 6, 16, Math.PI]} />
            <meshStandardMaterial color="#8a3324" />
          </mesh>
          {halloween && (
            <group position-y={0.12}>
              <WitchHat />
            </group>
          )}
        </group>
      </group>

      {/* Arms (moved every frame) */}
      <mesh ref={rUpper} raycast={noRaycast}>
        <cylinderGeometry args={[0.15, 0.13, 1, 10]} />
        {sweater}
      </mesh>
      <mesh ref={rLower} raycast={noRaycast}>
        <cylinderGeometry args={[0.13, 0.1, 1, 10]} />
        {sweater}
      </mesh>
      <mesh ref={rHand} raycast={noRaycast}>
        <sphereGeometry args={[0.13, 12, 10]} />
        {skin}
      </mesh>
      <mesh ref={lUpper} raycast={noRaycast}>
        <cylinderGeometry args={[0.15, 0.13, 1, 10]} />
        {sweater}
      </mesh>
      <mesh ref={lLower} raycast={noRaycast}>
        <cylinderGeometry args={[0.13, 0.1, 1, 10]} />
        {sweater}
      </mesh>
      <mesh ref={lHand} raycast={noRaycast}>
        <sphereGeometry args={[0.13, 12, 10]} />
        {skin}
      </mesh>

      {/* The coffee: a teal mug, dark coffee and rising steam */}
      <group ref={mug} position={MUG_HOME}>
        <mesh position-y={0.2} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[0.17, 0.15, 0.4, 20]} />
          <meshStandardMaterial color="#13a8a0" roughness={0.35} />
        </mesh>
        <mesh position-y={0.39} rotation-x={-Math.PI / 2} raycast={noRaycast}>
          <circleGeometry args={[0.15, 20]} />
          <meshStandardMaterial color="#3b2112" roughness={0.2} />
        </mesh>
        <mesh position={[0.19, 0.2, 0]} raycast={noRaycast}>
          <torusGeometry args={[0.09, 0.025, 8, 16]} />
          <meshStandardMaterial color="#13a8a0" roughness={0.35} />
        </mesh>
        <group ref={steam}>
          {steams.map((g, i) => (
            <mesh key={i} geometry={g} raycast={noRaycast}>
              <meshBasicMaterial
                color="#c9d0d8"
                transparent
                opacity={0.6}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
