"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { COUNTER_HEIGHT, type UnitLayout } from "../store/layout";
import { useTexture } from "../store/models";
import { ORANGE, TEAL, TEAL_DEEP, canvasTexture, seededRandom, fontFamily, noRaycast, signTexture } from "./paint";
import { advanceOf, letterGeometry } from "./text3d";
import { BULLETIN, COUNTER, type LANES } from "./world-layout";

/*
 * The furniture inside the store: the black fridge (each door opens on its
 * own), the snack shelving, the candy stand, the three checkout lanes, the
 * deals board with its bouncing yellow letters, and the floor arrows you tap
 * to walk around.
 *
 * Each piece is built in its own coordinates: x across its front, y up from
 * the floor, z = 0 at its front edge (shelves go back into -z).
 */

const GLOW_ORANGE = new THREE.Color(ORANGE).multiplyScalar(1.6);
const GLOW_TEAL = new THREE.Color(TEAL).multiplyScalar(1.5);
const GLOW_WHITE = new THREE.Color("#fffaf0").multiplyScalar(1.4);

function Glow({ args, position, color }: { args: [number, number, number]; position: [number, number, number]; color: THREE.Color }) {
  return (
    <mesh position={position} raycast={noRaycast}>
      <boxGeometry args={args} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/** A flat sign: words on a coloured panel. */
export function Panel({
  text,
  width,
  height,
  position,
  bg,
  fg,
  rotationY = 0,
  depth = 0.08,
}: {
  text: string;
  width: number;
  height: number;
  position: [number, number, number];
  bg: string;
  fg: string;
  rotationY?: number;
  depth?: number;
}) {
  const { texture, aspect } = signTexture(text, { bg, fg });
  const w = Math.min(width * 0.94, height * 0.9 * aspect);
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh raycast={noRaycast}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={bg} roughness={0.6} />
      </mesh>
      <mesh position-z={depth / 2 + 0.005} raycast={noRaycast}>
        <planeGeometry args={[w, w / aspect]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---- The fridge ------------------------------------------------------------------------------

/**
 * The black glass-door fridge: one door per section, lit inside, a sign over
 * each door. Tapping a door opens it (just that one); tap it again to close.
 * Products behind a closed door can't be tapped (the glass is in the way).
 */
export function WorldFridge({ layout, interactive }: { layout: UnitLayout; interactive: boolean }) {
  const wall = useTexture("/showcase/fridge/back-wall.webp");
  const frost = useTexture("/showcase/fridge/frost.webp");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const W = layout.width;
  const D = layout.depth;
  const top = layout.height + 0.2;
  const signH = 0.85;
  const metal = <meshStandardMaterial color="#121316" metalness={0.5} roughness={0.42} />;

  return (
    <group>
      <mesh position={[0, (layout.base - 0.08) / 2, -D / 2]}>
        <boxGeometry args={[W, layout.base - 0.08, D]} />
        {metal}
      </mesh>
      <Glow args={[W - 0.2, 0.03, 0.02]} position={[0, layout.base - 0.18, 0.01]} color={GLOW_ORANGE} />
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
      {/* Back of the fridge (so you can't see the wall through it) */}
      <mesh position={[0, (layout.base + top) / 2, -D - 0.02]} raycast={noRaycast}>
        <boxGeometry args={[W, top - layout.base + 0.2, 0.04]} />
        {metal}
      </mesh>

      {layout.bays.map((bay, i) => (
        <group key={bay.key}>
          <mesh position={[bay.x, (layout.base + top) / 2, -D + 0.03]} raycast={noRaycast}>
            <planeGeometry args={[bay.width, top - layout.base + 0.1]} />
            <meshStandardMaterial color="#dfeeee" map={wall} emissive="#ffffff" emissiveMap={wall} emissiveIntensity={0.7} roughness={0.9} />
          </mesh>
          {layout.shelves.map((s) => (
            <group key={s.y}>
              <mesh position={[bay.x, s.y - 0.0125, -D / 2]} raycast={noRaycast}>
                <boxGeometry args={[bay.width - 0.02, 0.025, D - 0.1]} />
                <meshStandardMaterial color="#cfe9e7" transparent opacity={0.5} roughness={0.1} />
              </mesh>
              <Glow args={[bay.width - 0.04, 0.035, 0.012]} position={[bay.x, s.y - 0.02, -0.05]} color={GLOW_ORANGE} />
            </group>
          ))}
          <FridgeDoor
            x={bay.x - bay.width / 2}
            width={bay.width}
            bottom={layout.base}
            height={top - layout.base}
            frost={frost}
            handleOnRight={i % 2 === 0}
            open={Boolean(open[bay.key])}
            interactive={interactive}
            onToggle={() => setOpen((o) => ({ ...o, [bay.key]: !o[bay.key] }))}
          />
          <Panel text={bay.title} width={bay.width} height={signH - 0.1} position={[bay.x, top + signH / 2, 0.02]} bg="#0d0e10" fg={ORANGE} />
        </group>
      ))}
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

/** One glass door, hinged on its left edge. It swings out toward you when opened. */
function FridgeDoor({
  x,
  width,
  bottom,
  height,
  frost,
  handleOnRight,
  open,
  interactive,
  onToggle,
}: {
  x: number;
  width: number;
  bottom: number;
  height: number;
  frost: THREE.Texture | null;
  handleOnRight: boolean;
  open: boolean;
  interactive: boolean;
  onToggle: () => void;
}) {
  const hinge = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = hinge.current;
    if (!g) return;
    const target = open ? -1.75 : 0;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, target, 7, delta);
  });
  const frame = <meshStandardMaterial color="#0c0d0f" metalness={0.5} roughness={0.4} />;
  const t = 0.07;

  return (
    <group ref={hinge} position={[x, bottom + height / 2, 0.04]}>
      <group position-x={width / 2}>
        {/* The glass: tapping it opens or closes the door */}
        <mesh
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (!interactive || e.delta > 8) return;
            e.stopPropagation();
            onToggle();
          }}
          onPointerOver={(e) => {
            if (!interactive) return;
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => interactive && (document.body.style.cursor = "")}
        >
          <planeGeometry args={[width - t * 2, height - t * 2]} />
          <meshStandardMaterial color="#e8f6ff" transparent opacity={0.1} roughness={0.05} metalness={0.6} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {frost && (
          <mesh position-z={0.004} raycast={noRaycast}>
            <planeGeometry args={[width - t * 2, height - t * 2]} />
            <meshBasicMaterial map={frost} transparent opacity={0.35} depthWrite={false} toneMapped={false} />
          </mesh>
        )}
        {/* Frame */}
        {[
          [0, height / 2 - t / 2, width, t],
          [0, -height / 2 + t / 2, width, t],
          [-width / 2 + t / 2, 0, t, height],
          [width / 2 - t / 2, 0, t, height],
        ].map(([fx, fy, fw, fh], i) => (
          <mesh key={i} position={[fx, fy, 0]} raycast={noRaycast}>
            <boxGeometry args={[fw, fh, 0.06]} />
            {frame}
          </mesh>
        ))}
        <RoundedBox args={[0.06, Math.min(2.4, height * 0.4), 0.08]} radius={0.03} position={[(handleOnRight ? 1 : -1) * (width / 2 - 0.2), 0, 0.08]} raycast={noRaycast}>
          <meshStandardMaterial color="#d8dde2" metalness={1} roughness={0.2} />
        </RoundedBox>
      </group>
    </group>
  );
}

// ---- Snack shelving ---------------------------------------------------------------------------

function usePegboard() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e4e1da";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#b9b4aa";
    for (let y = 16; y < 128; y += 32)
      for (let x = 16; x < 128; x += 32) {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    return canvasTexture(c, [16, 8]);
  }, []);
}

/** The snack shelving: white metal on a light pegboard, a light under each shelf, signs on top. */
export function WorldShelf({ layout }: { layout: UnitLayout }) {
  const peg = usePegboard();
  const W = layout.width;
  const D = layout.depth;
  const top = layout.height + 0.15;
  const steel = <meshStandardMaterial color="#e9eaec" metalness={0.35} roughness={0.38} />;

  return (
    <group>
      <mesh position={[0, (layout.base - 0.04) / 2, -D / 2]}>
        <boxGeometry args={[W, layout.base - 0.04, D]} />
        <meshStandardMaterial color="#f3f1ec" roughness={0.55} />
      </mesh>
      <mesh position={[0, layout.base * 0.5, 0.012]} raycast={noRaycast}>
        <boxGeometry args={[W - 0.1, 0.08, 0.02]} />
        <meshStandardMaterial color={TEAL} roughness={0.5} />
      </mesh>
      <mesh position={[0, (layout.base + top + 1.1) / 2, -D]} raycast={noRaycast}>
        <planeGeometry args={[W, top + 1.1 - layout.base]} />
        <meshStandardMaterial map={peg} roughness={0.85} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + 0.05), (top + 1.1) / 2, -D / 2]}>
          <boxGeometry args={[0.1, top + 1.1, D + 0.05]} />
          <meshStandardMaterial color="#f7f6f2" roughness={0.5} />
        </mesh>
      ))}
      {layout.shelves.map((s, k) => (
        <group key={s.y}>
          <mesh position={[0, s.y - 0.02, -D / 2]}>
            <boxGeometry args={[W, 0.04, D]} />
            {steel}
          </mesh>
          <mesh position={[0, s.y - 0.06, 0.015]}>
            <boxGeometry args={[W, 0.1, 0.03]} />
            <meshStandardMaterial color="#2b2d31" roughness={0.5} />
          </mesh>
          {k > 0 && <Glow args={[W - 0.1, 0.012, 0.04]} position={[0, s.y - 0.115, -0.08]} color={GLOW_WHITE} />}
        </group>
      ))}
      {layout.bays.slice(1).map((bay) => (
        <mesh key={bay.key} position={[bay.x - bay.width / 2 - 0.06, (layout.base + top) / 2, -D / 2]}>
          <boxGeometry args={[0.05, top - layout.base, D]} />
          {steel}
        </mesh>
      ))}
      {layout.bays.map((bay) => (
        <Panel key={bay.key} text={bay.title} width={bay.width - 0.1} height={0.55} position={[bay.x, top + 0.32, -D + 0.08]} bg={TEAL} fg="#ffffff" />
      ))}
      <Panel text={layout.sign} width={Math.min(W * 0.5, 5)} height={0.85} position={[0, top + 1.25, -D + 0.08]} bg={ORANGE} fg="#ffffff" />
    </group>
  );
}

// ---- Candy stand ------------------------------------------------------------------------------

/** The candy stand: a white cabinet with tiered steps on top, so every row of candy shows. */
export function CandyStand({ layout }: { layout: UnitLayout }) {
  const W = layout.width;
  const back = layout.shelves[layout.shelves.length - 1].z - 0.7;
  return (
    <group>
      <mesh position={[0, COUNTER_HEIGHT / 2, back / 2]}>
        <boxGeometry args={[W + 0.4, COUNTER_HEIGHT, -back + 0.5]} />
        <meshStandardMaterial color="#f5f3ee" roughness={0.5} />
      </mesh>
      <mesh position={[0, COUNTER_HEIGHT - 0.25, 0.26]} raycast={noRaycast}>
        <boxGeometry args={[W + 0.42, 0.18, 0.02]} />
        <meshStandardMaterial color={ORANGE} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.12, 0.26]} raycast={noRaycast}>
        <boxGeometry args={[W + 0.42, 0.24, 0.02]} />
        <meshStandardMaterial color={TEAL_DEEP} roughness={0.5} />
      </mesh>
      {layout.shelves.map((s, k) => (
        <group key={s.y}>
          <mesh position={[0, (COUNTER_HEIGHT + s.y) / 2, s.z - 0.33]} raycast={noRaycast}>
            <boxGeometry args={[W, s.y - COUNTER_HEIGHT, 0.66]} />
            <meshStandardMaterial color={k % 2 ? "#ece7dc" : "#f6f2ea"} roughness={0.5} />
          </mesh>
          <mesh position={[0, s.y - 0.02, s.z + 0.005]} raycast={noRaycast}>
            <boxGeometry args={[W, 0.04, 0.02]} />
            <meshStandardMaterial color={ORANGE} roughness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, (COUNTER_HEIGHT + layout.height + 0.9) / 2, back + 0.02]}>
        <boxGeometry args={[W + 0.16, layout.height + 0.9 - COUNTER_HEIGHT, 0.06]} />
        <meshStandardMaterial color="#efe9dd" roughness={0.6} />
      </mesh>
      {layout.bays.map((bay) => (
        <Panel key={bay.key} text={bay.title} width={bay.width - 0.1} height={0.5} position={[bay.x, layout.height + 0.45, back + 0.1]} bg={TEAL} fg="#ffffff" />
      ))}
    </group>
  );
}

// ---- Checkout lanes ----------------------------------------------------------------------------

/** The moving belt picture: rubber ridges that scroll toward the register. */
function useBeltTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#1c1d20";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#2a2c30";
    for (let y = 0; y < 64; y += 16) ctx.fillRect(0, y, 64, 6);
    return canvasTexture(c, [1, 6]);
  }, []);
}

/**
 * One checkout lane: a counter with a moving belt, the register (screen,
 * cash drawer, receipt printer), a card reader for the customer, a bagging
 * shelf, and a light pole with the lane number.
 * Its own coordinates: the register end is at z = 0, the belt runs back into -z.
 */
export function CheckoutLane({
  lane,
  beltSpeed = 0.5,
  bag = true,
  divider = true,
}: {
  lane: (typeof LANES)[number];
  /** How fast the belt runs toward the register (scene units a second). */
  beltSpeed?: number;
  /** A paper bag on the bagging shelf (lane 1 has its own, which items drop into). */
  bag?: boolean;
  /** The bar that separates one shopper's things from the next. */
  divider?: boolean;
}) {
  const belt = useBeltTexture();
  const L = lane.length;
  const number = signTexture(String(lane.number), { bg: TEAL, fg: "#ffffff", height: 128, pad: 0.6 });
  const screen = signTexture("Firebirds Nest", { bg: "#0a2e2c", fg: "#5ff2e6", height: 96, pad: 0.3, upper: false });

  // Slide the belt's stripes along toward the register, so it looks like it's running.
  // (The stripe picture repeats 6 times along the belt.)
  const beltMat = useRef<THREE.MeshStandardMaterial>(null);
  const speedRef = useRef(beltSpeed);
  useFrame((_, delta) => {
    speedRef.current = THREE.MathUtils.damp(speedRef.current, beltSpeed, 4, delta);
    const map = beltMat.current?.map;
    if (map) map.offset.y = (map.offset.y + (delta * speedRef.current * 6) / (L - 1.4)) % 1;
  });

  const white = <meshStandardMaterial color="#f3f1ec" roughness={0.45} />;
  return (
    <group position={[lane.x, 0, lane.front]}>
      {/* Counter and belt */}
      <mesh position={[0, COUNTER / 2, -L / 2]}>
        <boxGeometry args={[2.2, COUNTER, L]} />
        {white}
      </mesh>
      <mesh position={[-1.105, COUNTER * 0.62, -L / 2]} raycast={noRaycast}>
        <boxGeometry args={[0.02, 0.35, L]} />
        <meshStandardMaterial color={ORANGE} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.15, -L / 2]} raycast={noRaycast}>
        <boxGeometry args={[2.24, 0.3, L + 0.02]} />
        <meshStandardMaterial color="#3a3c41" roughness={0.6} />
      </mesh>
      <mesh position={[0, COUNTER + 0.01, -L / 2 - 0.3]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[1.5, L - 1.4]} />
        <meshStandardMaterial ref={beltMat} map={belt} roughness={0.8} />
      </mesh>
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, COUNTER + 0.06, -L / 2 - 0.3]} raycast={noRaycast}>
          <boxGeometry args={[0.12, 0.12, L - 1.4]} />
          <meshStandardMaterial color="#c9ced3" metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
      {/* A divider bar sitting on the belt */}
      {divider && (
        <mesh position={[0, COUNTER + 0.1, -L + 1.6]} rotation-z={Math.PI / 2} raycast={noRaycast}>
          <cylinderGeometry args={[0.07, 0.07, 1.3, 3]} />
          <meshStandardMaterial color="#d23b2a" roughness={0.5} />
        </mesh>
      )}
      {/* Bagging shelf at the front, with a paper bag */}
      <mesh position={[0, COUNTER - 0.05, 0.6]} raycast={noRaycast}>
        <boxGeometry args={[2.2, 0.08, 1.2]} />
        <meshStandardMaterial color="#c9ced3" metalness={0.7} roughness={0.3} />
      </mesh>
      {bag && (
        <mesh position={[0.3, COUNTER + 0.45, 0.6]} raycast={noRaycast}>
          <boxGeometry args={[0.8, 0.9, 0.5]} />
          <meshStandardMaterial color="#c89b67" roughness={0.9} />
        </mesh>
      )}

      {/* Card reader for the customer (left side) */}
      <group position={[-0.75, COUNTER, -0.6]}>
        <mesh position-y={0.25} raycast={noRaycast}>
          <cylinderGeometry args={[0.04, 0.06, 0.5, 10]} />
          <meshStandardMaterial color="#2a2c30" />
        </mesh>
        <RoundedBox args={[0.42, 0.62, 0.1]} radius={0.04} position={[0, 0.72, 0]} rotation-x={-0.4} raycast={noRaycast}>
          <meshStandardMaterial color="#1e2024" roughness={0.4} />
        </RoundedBox>
      </group>

      {/* The register on the cashier's side (right) */}
      <group position={[1.9, 0, -1.2]}>
        <mesh position={[0, COUNTER / 2, 0]}>
          <boxGeometry args={[1.5, COUNTER, 1.9]} />
          {white}
        </mesh>
        <mesh position={[0, COUNTER + 0.18, 0.1]} raycast={noRaycast}>
          <boxGeometry args={[1.1, 0.34, 1.2]} />
          <meshStandardMaterial color="#25272b" roughness={0.5} />
        </mesh>
        <group position={[0, COUNTER + 0.95, -0.2]} rotation-y={-Math.PI / 2 - 0.35}>
          <RoundedBox args={[1.05, 0.72, 0.08]} radius={0.03} raycast={noRaycast}>
            <meshStandardMaterial color="#17181b" roughness={0.4} />
          </RoundedBox>
          <mesh position-z={0.045} raycast={noRaycast}>
            <planeGeometry args={[0.95, 0.62]} />
            <meshBasicMaterial map={screen.texture} toneMapped={false} />
          </mesh>
        </group>
        <mesh position={[0, COUNTER + 0.55, -0.2]} raycast={noRaycast}>
          <cylinderGeometry args={[0.05, 0.08, 0.5, 10]} />
          <meshStandardMaterial color="#2a2c30" />
        </mesh>
        <RoundedBox args={[0.35, 0.3, 0.4]} radius={0.04} position={[0.4, COUNTER + 0.5, 0.6]} raycast={noRaycast}>
          <meshStandardMaterial color="#e6e6e6" roughness={0.4} />
        </RoundedBox>
      </group>

      {/* Lane light: a pole with the lit-up lane number */}
      <group position={[1.15, 0, 0.9]}>
        <mesh position-y={4} raycast={noRaycast}>
          <cylinderGeometry args={[0.07, 0.07, 8, 10]} />
          <meshStandardMaterial color="#c9ced3" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position-y={8.3} raycast={noRaycast}>
          <boxGeometry args={[1.1, 1.1, 0.5]} />
          <meshStandardMaterial color={TEAL} roughness={0.4} />
        </mesh>
        {[0.26, -0.26].map((z, i) => (
          <mesh key={z} position={[0, 8.3, z]} rotation-y={i ? Math.PI : 0} raycast={noRaycast}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshBasicMaterial map={number.texture} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---- The deals board -----------------------------------------------------------------------------

export type BoardCard = { kind: "sale" | "coupon" | "bundle" | "rewards" | "member"; title: string; big: string; small: string };

const CARD_STYLES: Record<BoardCard["kind"], { bg: string; fg: string; accent: string }> = {
  sale: { bg: "#ffe66d", fg: "#1a1a1a", accent: "#d7262b" },
  coupon: { bg: "#ffffff", fg: "#1a1a1a", accent: ORANGE },
  bundle: { bg: TEAL, fg: "#ffffff", accent: "#ffe66d" },
  rewards: { bg: ORANGE, fg: "#ffffff", accent: "#ffffff" },
  member: { bg: "#1d1f24", fg: "#ffffff", accent: "#ffd21f" },
};

/** One paper card for the board (a sticky note, a dashed coupon, a teal bundle card…). */
function cardTexture(card: BoardCard) {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 240;
  const ctx = c.getContext("2d")!;
  const s = CARD_STYLES[card.kind];
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, 320, 240);
  if (card.kind === "coupon") {
    ctx.setLineDash([12, 8]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#333";
    ctx.strokeRect(10, 10, 300, 220);
    ctx.setLineDash([]);
  }
  ctx.fillStyle = s.accent;
  ctx.font = `800 30px ${fontFamily("display")}`;
  ctx.textAlign = "center";
  ctx.fillText(card.title.toUpperCase().slice(0, 22), 160, 52);
  ctx.fillStyle = s.fg;
  let size = 70;
  ctx.font = `800 ${size}px ${fontFamily("display")}`;
  while (ctx.measureText(card.big.toUpperCase()).width > 290 && size > 30) ctx.font = `800 ${(size -= 4)}px ${fontFamily("display")}`;
  ctx.fillText(card.big.toUpperCase(), 160, 140);
  ctx.font = `600 22px ${fontFamily("body")}`;
  const words = card.small.split(" ");
  let line = "";
  let y = 182;
  for (const w of words) {
    if (ctx.measureText(`${line} ${w}`).width > 280 && line) {
      ctx.fillText(line, 160, y);
      line = w;
      y += 26;
      if (y > 220) break;
    } else line = line ? `${line} ${w}` : w;
  }
  if (y <= 220) ctx.fillText(line, 160, y);
  return canvasTexture(c);
}

function useCork() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#c4935e";
    ctx.fillRect(0, 0, 256, 256);
    // Little specks, always the same pattern.
    const rand = seededRandom(7);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(90,55,25,0.35)" : "rgba(235,200,150,0.35)";
      ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2.5, 1 + rand() * 2.5);
    }
    return canvasTexture(c, [2, 1.4]);
  }, []);
}

/**
 * The deals board on its stand: cork in a wooden frame, with coupons, sales,
 * bundles and rewards pinned to it. Tapping it opens the list of deals.
 */
export function BulletinBoard({ cards, onOpen, near }: { cards: BoardCard[]; onOpen: () => void; near: boolean }) {
  const cork = useCork();
  const textures = useMemo(() => cards.slice(0, 6).map(cardTexture), [cards]);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  const { width: W, height: H, bottom } = BULLETIN;
  const wood = <meshStandardMaterial color="#7a4f2a" roughness={0.7} />;
  const cols = 3;
  const cw = W / cols;

  return (
    <group
      position={[BULLETIN.x, 0, BULLETIN.z]}
      rotation-y={BULLETIN.turn}
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
      {/* Legs and feet */}
      {[-W / 2 + 0.4, W / 2 - 0.4].map((x) => (
        <group key={x} position={[x, 0, -0.32]}>
          <mesh position-y={(bottom + H) / 2}>
            <boxGeometry args={[0.22, bottom + H, 0.22]} />
            {wood}
          </mesh>
          <mesh position-y={0.08}>
            <boxGeometry args={[0.3, 0.16, 1.6]} />
            {wood}
          </mesh>
        </group>
      ))}
      {/* Frame and cork */}
      <mesh position={[0, bottom + H / 2, -0.08]}>
        <boxGeometry args={[W + 0.4, H + 0.4, 0.2]} />
        {wood}
      </mesh>
      <mesh position={[0, bottom + H / 2, 0.025]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={cork} roughness={0.95} />
      </mesh>
      {/* Pinned cards (a little crooked, like real ones) */}
      {textures.map((t, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const rows = Math.ceil(textures.length / cols);
        const tilt = (((i * 37) % 9) - 4) * 0.025;
        return (
          <group key={i} position={[-W / 2 + cw * (col + 0.5), bottom + H / 2 + ((rows - 1) / 2 - row) * 1.95 - 0.1, 0.04 + i * 0.002]} rotation-z={tilt}>
            <mesh>
              <planeGeometry args={[cw * 0.86, cw * 0.86 * 0.75]} />
              <meshStandardMaterial map={t} roughness={0.8} />
            </mesh>
            <mesh position={[0, cw * 0.32, 0.05]}>
              <sphereGeometry args={[0.08, 12, 10]} />
              <meshStandardMaterial color={i % 2 ? "#d7262b" : TEAL} roughness={0.3} />
            </mesh>
          </group>
        );
      })}
      {near && <Panel text="Tap the board to see every deal" width={4.2} height={0.42} position={[0, bottom - 0.4, 0.1]} bg="#1d1f24" fg="#ffffff" />}
    </group>
  );
}

/**
 * Big yellow 3D letters that bob in a wave, with a yellow arrow under them
 * bouncing toward the board.
 */
export function YellowLetters({ text, size = 0.95, arrow: withArrow = true }: { text: string; size?: number; arrow?: boolean }) {
  const letters = useRef<THREE.Group>(null);
  const arrow = useRef<THREE.Group>(null);
  const chars = [...text.toUpperCase()];
  const gap = size * 0.06;
  const widths = chars.map((ch) => advanceOf(ch, size));
  const total = widths.reduce((a, b) => a + b + gap, -gap);
  let cursor = -total / 2;
  const xs = widths.map((w) => {
    const x = cursor + w / 2;
    cursor += w + gap;
    return x;
  });
  const arrowShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.28, 0.9);
    s.lineTo(0.28, 0.9);
    s.lineTo(0.28, 0.25);
    s.lineTo(0.62, 0.25);
    s.lineTo(0, -0.5);
    s.lineTo(-0.62, 0.25);
    s.lineTo(-0.28, 0.25);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 });
  }, []);
  useEffect(() => () => arrowShape.dispose(), [arrowShape]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    letters.current?.children.forEach((child, i) => {
      const wave = Math.sin(t * 2.6 - i * 0.45);
      child.position.y = wave * 0.16;
      child.rotation.z = wave * 0.05;
      const pop = 1 + Math.max(0, Math.sin(t * 1.3 - i * 0.3)) * 0.07;
      child.scale.setScalar(pop);
    });
    if (arrow.current) arrow.current.position.y = -0.95 - Math.abs(Math.sin(t * 3)) * 0.35;
  });

  const yellow = <meshStandardMaterial color="#ffd21f" emissive="#ffb000" emissiveIntensity={0.35} roughness={0.32} metalness={0.05} />;
  return (
    <group>
      <group ref={letters}>
        {chars.map((ch, i) =>
          ch === " " ? (
            <group key={i} />
          ) : (
            <mesh key={i} position-x={xs[i]} geometry={letterGeometry(ch, size, size * 0.35)} raycast={noRaycast}>
              {yellow}
            </mesh>
          ),
        )}
      </group>
      <group ref={arrow} visible={withArrow}>
        <mesh geometry={arrowShape} position={[0, 0, -0.15]} raycast={noRaycast}>
          {yellow}
        </mesh>
      </group>
    </group>
  );
}

// ---- Floor arrows ------------------------------------------------------------------------------

const labelCache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();
function labelTexture(text: string) {
  let hit = labelCache.get(text);
  if (!hit) {
    const s = signTexture(text, { bg: "#1d1f24", fg: "#ffffff", height: 96, font: "body", upper: false, pad: 0.55 });
    hit = s;
    labelCache.set(text, hit);
  }
  return hit;
}

/**
 * A spot you can walk to: a white disc on the floor with a black arrow
 * pointing the way, gently growing and shrinking, with a label above.
 */
export function FloorMarker({
  x,
  z,
  label,
  from,
  onGo,
}: {
  x: number;
  z: number;
  label: string;
  /** Where you're standing now (the arrow points away from you, toward the spot). */
  from: { x: number; z: number };
  onGo: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const arrow = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.78);
    s.lineTo(0.55, 0.12);
    s.lineTo(0.22, 0.12);
    s.lineTo(0.22, -0.62);
    s.lineTo(-0.22, -0.62);
    s.lineTo(-0.22, 0.12);
    s.lineTo(-0.55, 0.12);
    s.closePath();
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2); // lie flat; the tip now points to -z
    return g;
  }, []);
  useEffect(() => () => arrow.dispose(), [arrow]);
  const heading = Math.atan2(-(x - from.x), -(z - from.z));
  const { texture, aspect } = labelTexture(label);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.2) * 0.07;
    g.scale.setScalar(pulse * (hover ? 1.15 : 1));
  });

  return (
    <group position={[x, 0, z]}>
      <group
        ref={group}
        onClick={(e) => {
          if (e.delta > 8) return;
          e.stopPropagation();
          onGo();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <mesh position-y={0.03} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[1.2, 48]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.25} roughness={0.5} />
        </mesh>
        <mesh position-y={0.035} rotation-x={-Math.PI / 2} raycast={noRaycast}>
          <ringGeometry args={[1.12, 1.24, 48]} />
          <meshStandardMaterial color="#111111" roughness={0.5} />
        </mesh>
        <mesh position-y={0.045} rotation-y={heading} geometry={arrow} raycast={noRaycast}>
          <meshStandardMaterial color="#111111" roughness={0.5} />
        </mesh>
      </group>
      {/* The label can be tapped too (handy when the arrow is low on the screen). */}
      <sprite
        position-y={2.6}
        renderOrder={10}
        scale={[0.62 * aspect, 0.62, 1]}
        onClick={(e) => {
          if (e.delta > 8) return;
          e.stopPropagation();
          onGo();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <spriteMaterial map={texture} toneMapped={false} depthWrite={false} depthTest={false} />
      </sprite>
    </group>
  );
}

