"use client";

import { useEffect, useMemo } from "react";
import { MeshReflectorMaterial, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { FLAME_PATH, NEST_PATHS } from "@/components/brand-mark";
import { COUNTER_HEIGHT, ROOM, type UnitLayout } from "./layout";
import { useTexture } from "./models";

/*
 * The store itself: floor, walls, ceiling lights and neon, and the furniture
 * the products sit on (fridge, snack shelf, candy counter). Products and
 * price tags are added on top by store-scene.tsx.
 *
 * Glowing parts use colours brighter than white (e.g. [3, 1.2, 0.4]) with
 * toneMapped={false}: the "bloom" effect makes exactly those parts glow.
 */

const ORANGE = "#ff5a1f";
const TEAL = "#13a8a0";
/** Glow colours (brighter than 1, so they bloom). */
const GLOW_ORANGE = new THREE.Color(ORANGE).multiplyScalar(2.6);
const GLOW_TEAL = new THREE.Color(TEAL).multiplyScalar(2.4);
const GLOW_WHITE = new THREE.Color("#fff6ea").multiplyScalar(2.2);

/** Nothing to click: lets taps pass straight through (glass, glow strips, signs). */
const noRaycast = () => null;

/** A strip that glows. */
function Glow({ args, position, color, rotation }: { args: [number, number, number]; position: [number, number, number]; color: THREE.Color; rotation?: [number, number, number] }) {
  return (
    <mesh position={position} rotation={rotation} raycast={noRaycast}>
      <boxGeometry args={args} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

// ---- Text and logos drawn onto pictures -------------------------------------------------

function font(kind: "display" | "body") {
  return getComputedStyle(document.documentElement).getPropertyValue(kind === "display" ? "--font-display" : "--font-body").trim() || "sans-serif";
}

/**
 * Glowing sign text: a dark panel (or nothing, for neon on a wall) with the
 * words lit up and a soft halo around them.
 */
function useSignTexture(text: string, opts: { color: string; panel?: string; height?: number; neon?: boolean; logo?: boolean }) {
  const { color, panel, height = 128, neon = false, logo = false } = opts;
  const result = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const size = Math.round(height * 0.62);
    ctx.font = `800 ${size}px ${font("display")}`;
    const label = text.toUpperCase();
    const textW = ctx.measureText(label).width;
    const logoW = logo ? height * 0.95 : 0;
    const pad = height * 0.45;
    canvas.width = Math.ceil(textW + logoW + pad * 2);
    canvas.height = height;
    if (panel) {
      ctx.fillStyle = panel;
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, height * 0.12);
      ctx.fill();
    }
    ctx.textBaseline = "middle";
    ctx.font = `800 ${size}px ${font("display")}`;
    const x = pad + logoW;
    // Halo first, then the bright core of the letters.
    for (const [blur, alpha] of neon ? [[height * 0.35, 0.9], [height * 0.12, 1]] : [[height * 0.16, 0.7]]) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillText(label, x, height / 2 + size * 0.04);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = neon ? "#fff4ec" : "#ffffff";
    ctx.fillText(label, x, height / 2 + size * 0.04);

    if (logo) {
      // The flame-and-nest mark, drawn from the same paths as the website's logo.
      const s = (height * 0.8) / 32;
      ctx.save();
      ctx.translate(pad * 0.7, height * 0.1);
      ctx.scale(s, s);
      ctx.shadowColor = ORANGE;
      ctx.shadowBlur = 10 / s;
      ctx.fillStyle = "#ff7a3d";
      ctx.fill(new Path2D(FLAME_PATH), "evenodd");
      ctx.strokeStyle = "#3ee0d6";
      ctx.shadowColor = TEAL;
      ctx.lineWidth = 2.3;
      ctx.lineCap = "round";
      for (const d of NEST_PATHS) ctx.stroke(new Path2D(d));
      ctx.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return { texture, aspect: canvas.width / canvas.height };
  }, [text, color, panel, height, neon, logo]);
  useEffect(() => () => result.texture.dispose(), [result]);
  return result;
}

/** A lit sign: text on a dark panel, glowing (used over fridge doors, shelf bays, and hanging from the ceiling). */
export function Sign({ text, width, height, position, color = ORANGE, both = false }: { text: string; width: number; height: number; position: [number, number, number]; color?: string; both?: boolean }) {
  const { texture, aspect } = useSignTexture(text, { color, panel: "#0b0b0d" });
  // Fit the words inside the panel.
  const w = Math.min(width * 0.94, height * 0.9 * aspect);
  const h = w / aspect;
  const glow = useMemo(() => new THREE.Color(1.6, 1.6, 1.6), []);
  return (
    <group position={position}>
      <mesh raycast={noRaycast}>
        <boxGeometry args={[width, height, 0.08]} />
        <meshStandardMaterial color="#0b0b0d" roughness={0.6} />
      </mesh>
      {[0, ...(both ? [Math.PI] : [])].map((turn) => (
        <mesh key={turn} rotation-y={turn} position-z={turn ? -0.045 : 0.045} raycast={noRaycast}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={texture} transparent color={glow} toneMapped={false} />
        </mesh>
      ))}
      {/* A thin glowing edge along the bottom */}
      <Glow args={[width, 0.03, 0.03]} position={[0, -height / 2, 0.05]} color={color === TEAL ? GLOW_TEAL : GLOW_ORANGE} />
    </group>
  );
}

/** Neon letters straight on a wall (no panel). */
function Neon({ text, height, position, color, logo = false }: { text: string; height: number; position: [number, number, number]; color: string; logo?: boolean }) {
  const { texture, aspect } = useSignTexture(text, { color, neon: true, height: 192, logo });
  const glow = useMemo(() => new THREE.Color(2.2, 2.2, 2.2), []);
  return (
    <mesh position={position} raycast={noRaycast}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={texture} transparent color={glow} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** A sign hanging from the ceiling on two thin cables, lit on both sides. */
export function HangingSign({ text, y }: { text: string; y: number }) {
  const width = Math.max(3.2, text.length * 0.42);
  const cable = ROOM.height - y - 0.45;
  return (
    <group>
      <Sign text={text} width={width} height={0.9} position={[0, y, 0]} both />
      {[-width / 2 + 0.3, width / 2 - 0.3].map((x) => (
        <mesh key={x} position={[x, y + 0.45 + cable / 2, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.012, 0.012, cable, 6]} />
          <meshStandardMaterial color="#666" metalness={1} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

// ---- The room -------------------------------------------------------------------------------

/** Dark tiles for the floor, drawn once. */
function useFloorTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d")!;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#34363c" : "#272a30";
        ctx.fillRect(x * 128, y * 128, 128, 128);
      }
    ctx.strokeStyle = "#0e0f11";
    ctx.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 128, 0);
      ctx.lineTo(i * 128, 512);
      ctx.moveTo(0, i * 128);
      ctx.lineTo(512, i * 128);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 5);
    t.anisotropy = 8;
    return t;
  }, []);
}

/**
 * Floor, walls, ceiling with its light bars, wall trim and the neon logo.
 * `fancy` turns on the shiny floor that reflects the lights (it costs speed,
 * so slower devices get a plain floor).
 */
export function Room({ fancy, logoX }: { fancy: boolean; logoX: number }) {
  const floor = useFloorTexture();
  const W = ROOM.halfWidth * 2;
  const D = ROOM.front - ROOM.back;
  const midZ = (ROOM.front + ROOM.back) / 2;
  const wall = <meshStandardMaterial color="#23252b" roughness={0.85} />;
  const lower = <meshStandardMaterial color="#121317" roughness={0.6} />;

  return (
    <group>
      {/* Floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, midZ]} raycast={noRaycast}>
        <planeGeometry args={[W, D]} />
        {fancy ? (
          <MeshReflectorMaterial
            map={floor}
            blur={[280, 90]}
            resolution={512}
            mixBlur={1}
            mixStrength={3.2}
            roughness={0.75}
            depthScale={0.8}
            minDepthThreshold={0.3}
            maxDepthThreshold={1.3}
            metalness={0.4}
            mirror={0.55}
          />
        ) : (
          <meshStandardMaterial map={floor} roughness={0.35} metalness={0.25} />
        )}
      </mesh>

      {/* Walls: back, left, right; darker lower band with a teal light line along the top of it */}
      <mesh position={[0, ROOM.height / 2, ROOM.back]} raycast={noRaycast}>
        <planeGeometry args={[W, ROOM.height]} />
        {wall}
      </mesh>
      <mesh position={[-ROOM.halfWidth, ROOM.height / 2, midZ]} rotation-y={Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[D, ROOM.height]} />
        {wall}
      </mesh>
      <mesh position={[ROOM.halfWidth, ROOM.height / 2, midZ]} rotation-y={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[D, ROOM.height]} />
        {wall}
      </mesh>
      <mesh position={[0, 1.2, ROOM.back + 0.02]} raycast={noRaycast}>
        <boxGeometry args={[W, 2.4, 0.04]} />
        {lower}
      </mesh>
      <mesh position={[ROOM.halfWidth - 0.02, 1.2, midZ]} raycast={noRaycast}>
        <boxGeometry args={[0.04, 2.4, D]} />
        {lower}
      </mesh>
      <Glow args={[W, 0.04, 0.04]} position={[0, 2.42, ROOM.back + 0.05]} color={GLOW_TEAL} />
      <Glow args={[0.04, 0.04, D]} position={[ROOM.halfWidth - 0.05, 2.42, midZ]} color={GLOW_TEAL} />
      <Glow args={[0.04, 0.04, D]} position={[-ROOM.halfWidth + 0.05, ROOM.height - 0.3, midZ]} color={GLOW_ORANGE} />
      <Glow args={[W, 0.04, 0.04]} position={[0, ROOM.height - 0.3, ROOM.back + 0.05]} color={GLOW_ORANGE} />
      <Glow args={[0.04, 0.04, D]} position={[ROOM.halfWidth - 0.05, ROOM.height - 0.3, midZ]} color={GLOW_ORANGE} />

      {/* Ceiling with rows of long LED light bars */}
      <mesh position={[0, ROOM.height, midZ]} rotation-x={Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#111215" roughness={0.9} />
      </mesh>
      {[-4.8, -1, 2.8, 6.6].map((z) => (
        <group key={z} position={[0.6, ROOM.height - 0.12, z]}>
          <mesh raycast={noRaycast}>
            <boxGeometry args={[12.6, 0.12, 0.42]} />
            <meshStandardMaterial color="#1a1b1e" metalness={0.6} roughness={0.4} />
          </mesh>
          <Glow args={[12.2, 0.02, 0.26]} position={[0, -0.065, 0]} color={GLOW_WHITE} />
        </group>
      ))}

      {/* Neon logo on the back wall, and an "open" sign and slogan between the fridge and the snack shelf */}
      <Neon text="Firebirds Nest" height={1.5} position={[logoX, 7.55, ROOM.back + 0.06]} color={ORANGE} logo />
      <Neon text="Open" height={0.85} position={[-6.7, 5.5, ROOM.back + 0.06]} color={TEAL} />
      <Neon text="Order between classes" height={0.36} position={[-6.7, 4.65, ROOM.back + 0.06]} color={ORANGE} />
    </group>
  );
}

// ---- Furniture ---------------------------------------------------------------------------------

/** Pictures used by the fridge (the same ones as the Drinks tab fridge). */
function useFridgePictures() {
  const wall = useTexture("/showcase/fridge/back-wall.webp");
  const frost = useTexture("/showcase/fridge/frost.webp");
  return { wall, frost };
}

/**
 * The glass-door fridge: one door per section, lit from inside, a lit sign
 * over each door, shelves with glowing front edges and a little frost.
 */
export function FridgeUnit({ layout }: { layout: UnitLayout }) {
  const { wall, frost } = useFridgePictures();
  const W = layout.width;
  const D = layout.depth;
  const top = layout.height + 0.2;
  const signH = 0.85;
  const metal = <meshStandardMaterial color="#111215" metalness={0.5} roughness={0.45} />;

  return (
    <group>
      {/* Base with a vent and an orange light line */}
      <mesh position={[0, (layout.base - 0.08) / 2, -D / 2]}>
        <boxGeometry args={[W, layout.base - 0.08, D]} />
        {metal}
      </mesh>
      <Glow args={[W - 0.2, 0.03, 0.02]} position={[0, layout.base - 0.18, 0.01]} color={GLOW_ORANGE} />
      {/* Sides and top */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 - 0.08), (top + signH + 0.15) / 2, -D / 2]}>
          <boxGeometry args={[0.16, top + signH + 0.15, D]} />
          {metal}
        </mesh>
      ))}
      <mesh position={[0, top + signH + 0.1, -D / 2]}>
        <boxGeometry args={[W, 0.12, D]} />
        {metal}
      </mesh>

      {layout.bays.map((bay, i) => (
        <group key={bay.key}>
          {/* Lit back wall */}
          <mesh position={[bay.x, (layout.base + top) / 2, -D + 0.03]} raycast={noRaycast}>
            <planeGeometry args={[bay.width, top - layout.base + 0.1]} />
            <meshStandardMaterial color="#dfeeee" map={wall} emissive="#ffffff" emissiveMap={wall} emissiveIntensity={0.85} roughness={0.9} />
          </mesh>
          {/* Glass shelves with a glowing orange front edge */}
          {layout.shelves.map((s) => (
            <group key={s.y}>
              <mesh position={[bay.x, s.y - 0.0125, -D / 2]} raycast={noRaycast}>
                <boxGeometry args={[bay.width - 0.02, 0.025, D - 0.1]} />
                <meshStandardMaterial color="#cfe9e7" transparent opacity={0.5} roughness={0.1} />
              </mesh>
              <Glow args={[bay.width - 0.04, 0.035, 0.012]} position={[bay.x, s.y - 0.02, -0.05]} color={GLOW_ORANGE} />
            </group>
          ))}
          {/* Door: glass with a frame, frost at the bottom, a chrome handle */}
          <mesh position={[bay.x, (layout.base + top) / 2, 0.02]} raycast={noRaycast}>
            <planeGeometry args={[bay.width, top - layout.base]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.07} roughness={0.05} metalness={0.9} depthWrite={false} />
          </mesh>
          {frost && (
            <mesh position={[bay.x, (layout.base + top) / 2, 0.025]} raycast={noRaycast}>
              <planeGeometry args={[bay.width, top - layout.base]} />
              <meshBasicMaterial map={frost} transparent opacity={0.4} depthWrite={false} toneMapped={false} />
            </mesh>
          )}
          <RoundedBox args={[0.06, Math.min(2.6, (top - layout.base) * 0.4), 0.08]} radius={0.03} position={[bay.x + (i % 2 ? -1 : 1) * (bay.width / 2 - 0.16), layout.base + (top - layout.base) * 0.5, 0.09]}>
            <meshStandardMaterial color="#d8dde2" metalness={1} roughness={0.2} />
          </RoundedBox>
          {/* Lit sign over the door */}
          <Sign text={bay.title} width={bay.width} height={signH - 0.1} position={[bay.x, top + signH / 2, 0.02]} />
        </group>
      ))}
      {/* Posts between the doors, with a teal light strip down each */}
      {layout.bays.slice(1).map((bay) => (
        <group key={bay.key} position={[bay.x - bay.width / 2 - 0.08, (layout.base + top) / 2, 0]}>
          <mesh>
            <boxGeometry args={[0.16, top - layout.base + 0.1, 0.14]} />
            {metal}
          </mesh>
          <Glow args={[0.025, top - layout.base - 0.2, 0.02]} position={[0, 0, 0.075]} color={GLOW_TEAL} />
        </group>
      ))}
    </group>
  );
}

/** Pegboard for the back of the snack shelf, drawn once. */
function usePegboard() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#24252a";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#121316";
    for (let y = 16; y < 128; y += 32)
      for (let x = 16; x < 128; x += 32) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(16, 8);
    return t;
  }, []);
}

/** The snack shelf: metal shelving on a pegboard back, warm lights under each shelf, a big sign on top. */
export function ShelfUnit({ layout }: { layout: UnitLayout }) {
  const peg = usePegboard();
  const W = layout.width;
  const D = layout.depth;
  const top = layout.height + 0.15;
  const steel = <meshStandardMaterial color="#c9ccd1" metalness={0.7} roughness={0.35} />;

  return (
    <group>
      {/* Kick plate with an orange line */}
      <mesh position={[0, (layout.base - 0.04) / 2, -D / 2]}>
        <boxGeometry args={[W, layout.base - 0.04, D]} />
        <meshStandardMaterial color="#16171a" roughness={0.6} />
      </mesh>
      <Glow args={[W - 0.1, 0.03, 0.02]} position={[0, layout.base * 0.55, 0.01]} color={GLOW_ORANGE} />
      {/* Pegboard back and end panels */}
      <mesh position={[0, (layout.base + top + 1.1) / 2, -D]} raycast={noRaycast}>
        <planeGeometry args={[W, top + 1.1 - layout.base]} />
        <meshStandardMaterial map={peg} roughness={0.8} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + 0.05), (top + 1.1) / 2, -D / 2]}>
          <boxGeometry args={[0.1, top + 1.1, D + 0.05]} />
          <meshStandardMaterial color="#0f1013" roughness={0.5} />
        </mesh>
      ))}
      {/* Shelves: steel, a black price strip along the front, warm light underneath */}
      {layout.shelves.map((s, k) => (
        <group key={s.y}>
          <mesh position={[0, s.y - 0.02, -D / 2]}>
            <boxGeometry args={[W, 0.04, D]} />
            {steel}
          </mesh>
          <mesh position={[0, s.y - 0.06, 0.015]}>
            <boxGeometry args={[W, 0.1, 0.03]} />
            <meshStandardMaterial color="#0d0d0f" roughness={0.5} />
          </mesh>
          {k > 0 && <Glow args={[W - 0.1, 0.012, 0.04]} position={[0, s.y - 0.115, -0.08]} color={GLOW_WHITE} />}
        </group>
      ))}
      {/* Bay dividers */}
      {layout.bays.slice(1).map((bay) => (
        <mesh key={bay.key} position={[bay.x - bay.width / 2 - 0.06, (layout.base + top) / 2, -D / 2]}>
          <boxGeometry args={[0.05, top - layout.base, D]} />
          {steel}
        </mesh>
      ))}
      {/* A sign per bay, and the big sign across the top */}
      {layout.bays.map((bay) => (
        <Sign key={bay.key} text={bay.title} width={bay.width - 0.1} height={0.55} position={[bay.x, top + 0.32, -D + 0.08]} color={TEAL} />
      ))}
      <Sign text={layout.sign} width={Math.min(W * 0.5, 5)} height={0.85} position={[0, top + 1.25, -D + 0.08]} />
    </group>
  );
}

/**
 * The checkout counter with the candy rack on top: tiered steps (each one a
 * little further back) so every row of candy shows, and the register at the side.
 */
export function CandyCounter({ layout }: { layout: UnitLayout }) {
  const W = layout.width;
  const counterW = W + 3.4;
  const counterX = 1.1;
  const front = 0.75;
  const back = -2.9;
  const screen = useSignTexture("Pay at pickup", { color: TEAL, panel: "#081414", height: 96 });

  return (
    <group>
      {/* Counter body, glowing trim, stone top */}
      <mesh position={[counterX, COUNTER_HEIGHT / 2, (front + back) / 2]}>
        <boxGeometry args={[counterW, COUNTER_HEIGHT, front - back]} />
        <meshStandardMaterial color="#121316" roughness={0.55} />
      </mesh>
      <Glow args={[counterW, 0.04, 0.03]} position={[counterX, COUNTER_HEIGHT - 0.22, front + 0.01]} color={GLOW_ORANGE} />
      <Glow args={[counterW, 0.03, 0.03]} position={[counterX, 0.18, front + 0.01]} color={GLOW_TEAL} />
      <mesh position={[counterX, COUNTER_HEIGHT + 0.05, (front + back) / 2 + 0.05]}>
        <boxGeometry args={[counterW + 0.2, 0.1, front - back + 0.25]} />
        <meshStandardMaterial color="#e9e5dd" roughness={0.3} />
      </mesh>

      {/* The tiered candy rack */}
      {layout.shelves.map((s, k) => (
        <group key={s.y}>
          <mesh position={[0, (COUNTER_HEIGHT + 0.1 + s.y) / 2, s.z - 0.33]}>
            <boxGeometry args={[W, s.y - COUNTER_HEIGHT - 0.1, 0.66]} />
            <meshStandardMaterial color={k % 2 ? "#1a1b1f" : "#141518"} roughness={0.5} />
          </mesh>
          <Glow args={[W, 0.025, 0.02]} position={[0, s.y - 0.02, s.z + 0.005]} color={GLOW_ORANGE} />
        </group>
      ))}
      {/* Back panel, so the wall behind doesn't show between the tiers */}
      <mesh position={[0, (COUNTER_HEIGHT + layout.height + 0.9) / 2, layout.shelves[layout.shelves.length - 1].z - 0.68]}>
        <boxGeometry args={[W + 0.16, layout.height + 0.9 - COUNTER_HEIGHT, 0.06]} />
        <meshStandardMaterial color="#0f1013" roughness={0.6} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (W / 2 + 0.04), layout.height / 2 + COUNTER_HEIGHT / 2, -layout.depth / 2 + 0.3]}>
          <boxGeometry args={[0.08, layout.height - COUNTER_HEIGHT + 0.2, layout.depth]} />
          <meshStandardMaterial color="#0d0e10" roughness={0.5} />
        </mesh>
      ))}
      {layout.bays.map((bay) => (
        <Sign
          key={bay.key}
          text={bay.title}
          width={bay.width - 0.1}
          height={0.5}
          position={[bay.x, layout.height + 0.45, layout.shelves[layout.shelves.length - 1].z - 0.5]}
          color={TEAL}
        />
      ))}

      {/* Register: a stand with a glowing screen, and a card reader */}
      <group position={[W / 2 + 1.5, COUNTER_HEIGHT + 0.1, -0.9]} rotation-y={-0.35}>
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.06, 0.12, 0.7, 16]} />
          <meshStandardMaterial color="#202227" metalness={0.6} roughness={0.35} />
        </mesh>
        <group position={[0, 0.95, 0]} rotation-x={-0.25}>
          <RoundedBox args={[1.25, 0.82, 0.07]} radius={0.03}>
            <meshStandardMaterial color="#0d0e10" roughness={0.4} />
          </RoundedBox>
          <mesh position-z={0.04} raycast={noRaycast}>
            <planeGeometry args={[1.12, 0.7]} />
            <meshBasicMaterial map={screen.texture} color={new THREE.Color(1.4, 1.4, 1.4)} toneMapped={false} />
          </mesh>
        </group>
        <RoundedBox args={[0.32, 0.08, 0.48]} radius={0.03} position={[0.95, 0.05, 0.25]}>
          <meshStandardMaterial color="#1b1c20" roughness={0.4} />
        </RoundedBox>
      </group>
    </group>
  );
}
