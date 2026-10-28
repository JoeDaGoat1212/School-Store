"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { brand } from "@/config/brand";
import { CREAM, ORANGE, TEAL, TEAL_DEEP, canvasTexture, seededRandom, noRaycast, signTexture, toonRamp } from "./paint";
import { advanceOf, flameGeometry, letterGeometry } from "./text3d";
import { BUILDING, INSIDE, doors } from "./world-layout";

/*
 * Everything outside: the tan store with its sign, side windows and double
 * doors, the parking lot with cartoon cars, trees, lamp posts, grass and sky.
 * Cartoon "toon" shading outside; the doors can be tapped to walk in.
 */

function Toon({ color }: { color: string }) {
  return <meshToonMaterial color={color} gradientMap={toonRamp()} />;
}

// ---- The building --------------------------------------------------------------------------------

const TAN = "#dcc49c";
const TAN_DARK = "#b39467";
const PAINT_IN = "#f7f4ee";

/** A slab of wall: tan on the outside face, cream paint on the inside face. */
function Wall({ size, position, outside }: { size: [number, number, number]; position: [number, number, number]; outside: "+x" | "-x" | "+z" | "-z" }) {
  // Box faces: +x, -x, +y, -y, +z, -z
  const order = ["+x", "-x", "+y", "-y", "+z", "-z"];
  const inside = { "+x": "-x", "-x": "+x", "+z": "-z", "-z": "+z" }[outside];
  return (
    <mesh position={position} castShadow raycast={noRaycast}>
      <boxGeometry args={size} />
      {order.map((f, i) => (
        <meshStandardMaterial key={f} attach={`material-${i}`} color={f === inside ? PAINT_IN : TAN} roughness={0.85} />
      ))}
    </mesh>
  );
}

/** The store: walls with the window and door openings, roof, sign, windows, canopy and doors. */
export function Building({ onDoors, canEnter, openSign }: { onDoors: () => void; canEnter: boolean; openSign: { title: string; line: string } }) {
  const { halfWidth: HW, depth: D, height: H, wall: T, doorHalf, doorHeight, windowX, windowY } = BUILDING;
  const [w0, w1] = windowX;
  const [y0, y1] = windowY;

  // Front wall pieces around the windows and the door (x from, x to, y from, y to).
  const front: [number, number, number, number][] = [
    [-HW, -w1, 0, H],
    [-w1, -w0, 0, y0],
    [-w1, -w0, y1, H],
    [-w0, -doorHalf, 0, H],
    [-doorHalf, doorHalf, doorHeight, H],
    [doorHalf, w0, 0, H],
    [w0, w1, 0, y0],
    [w0, w1, y1, H],
    [w1, HW, 0, H],
  ];

  return (
    <group>
      {front.map(([xa, xb, ya, yb], i) => (
        <Wall key={i} size={[xb - xa, yb - ya, T]} position={[(xa + xb) / 2, (ya + yb) / 2, -T / 2]} outside="+z" />
      ))}
      <Wall size={[T, H, D]} position={[-HW + T / 2, H / 2, -D / 2]} outside="-x" />
      <Wall size={[T, H, D]} position={[HW - T / 2, H / 2, -D / 2]} outside="+x" />
      <Wall size={[HW * 2, H, T]} position={[0, H / 2, -D + T / 2]} outside="-z" />

      {/* A darker band along the bottom, and the roof ledge (parapet) on top */}
      <mesh position={[0, 0.7, 0.02]} raycast={noRaycast}>
        <boxGeometry args={[HW * 2 + 0.1, 1.4, 0.06]} />
        <Toon color={TAN_DARK} />
      </mesh>
      {[
        [0, H + 0.7, 0.05, HW * 2 + 0.6, 1.4, 0.8],
        [0, H + 0.7, -D + 0.3, HW * 2 + 0.6, 1.4, 0.8],
        [-HW - 0.05, H + 0.7, -D / 2, 0.8, 1.4, D],
        [HW + 0.05, H + 0.7, -D / 2, 0.8, 1.4, D],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]} castShadow raycast={noRaycast}>
          <boxGeometry args={[w, h, d]} />
          <Toon color={TAN_DARK} />
        </mesh>
      ))}
      {/* Roof: grey on top, white ceiling underneath */}
      <mesh position={[0, H + 0.15, -D / 2]} raycast={noRaycast}>
        <boxGeometry args={[HW * 2, 0.3, D]} />
        {["#a39d93", "#a39d93", "#a39d93", "#fbfaf7", "#a39d93", "#a39d93"].map((c, i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} color={c} roughness={0.9} />
        ))}
      </mesh>
      {/* Air-conditioning units on the roof (they make the drone view look real) */}
      {[
        [-15, -11],
        [-4, -27],
        [14, -18],
        [21, -33],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, H + 0.3, z]}>
          <RoundedBox args={[4, 1.8, 3]} radius={0.15} position-y={0.9} castShadow raycast={noRaycast}>
            <Toon color="#c9ccd0" />
          </RoundedBox>
          <mesh position-y={1.82} rotation-x={-Math.PI / 2} raycast={noRaycast}>
            <circleGeometry args={[0.9, 24]} />
            <meshStandardMaterial color="#4b4f55" />
          </mesh>
        </group>
      ))}

      <StoreSign />
      <Windows />
      <Canopy />
      <Doors onOpen={onDoors} canEnter={canEnter} openSign={openSign} />

      {/* Planters with shrubs under the windows */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * ((w0 + w1) / 2), 0, 1.4]}>
          <mesh position-y={0.45} castShadow receiveShadow raycast={noRaycast}>
            <boxGeometry args={[w1 - w0, 0.9, 1.6]} />
            <Toon color="#b9b2a6" />
          </mesh>
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[-(w1 - w0) / 2 + 1.3 + i * ((w1 - w0 - 2.6) / 8), 1.3, 0]} castShadow raycast={noRaycast}>
              <icosahedronGeometry args={[0.85, 1]} />
              <meshToonMaterial color={i % 2 ? "#4f9a3d" : "#5fae47"} gradientMap={toonRamp()} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** "FIREBIRDS NEST" in big orange 3D letters on a teal band, with the flame logo. */
function StoreSign() {
  const size = 2.6;
  const text = brand.name.toUpperCase();
  const gap = size * 0.08;
  const chars = [...text];
  const widths = chars.map((c) => advanceOf(c, size));
  const total = widths.reduce((a, b) => a + b + gap, -gap);
  const logo = 3.2;
  let cursor = -total / 2 + logo / 2 + 0.6;
  const xs = widths.map((w) => {
    const x = cursor + w / 2;
    cursor += w + gap;
    return x;
  });
  const y = BUILDING.doorHeight + 1.25;
  const bandW = total + logo + 3.2;
  const flame = flameGeometry(logo * 0.95, 0.35);
  const letterMat = <meshStandardMaterial color={ORANGE} emissive={ORANGE} emissiveIntensity={0.25} roughness={0.35} />;

  return (
    <group position={[0, y, 0.05]}>
      <RoundedBox args={[bandW, size + 1.4, 0.35]} radius={0.2} position={[0, size / 2 - 0.05, 0.1]} castShadow raycast={noRaycast}>
        <meshStandardMaterial color={TEAL_DEEP} roughness={0.55} />
      </RoundedBox>
      {/* The logo: a cream disc with the orange flame */}
      <group position={[-total / 2 - logo / 2 + 0.2, size / 2 - 0.05, 0.3]}>
        <mesh rotation-x={Math.PI / 2} raycast={noRaycast}>
          <cylinderGeometry args={[logo * 0.62, logo * 0.62, 0.2, 40]} />
          <meshStandardMaterial color={CREAM} roughness={0.5} />
        </mesh>
        <mesh geometry={flame} position={[0, -logo * 0.47, 0.12]} raycast={noRaycast}>
          {letterMat}
        </mesh>
      </group>
      {chars.map((ch, i) =>
        ch === " " ? null : (
          <mesh key={i} geometry={letterGeometry(ch, size, 0.45)} position={[xs[i], 0, 0.5]} castShadow raycast={noRaycast}>
            {letterMat}
          </mesh>
        ),
      )}
    </group>
  );
}

/** The big front windows: glass in dark frames (you can see into the store). */
function Windows() {
  const { windowX: [w0, w1], windowY: [y0, y1] } = BUILDING;
  const frame = <meshStandardMaterial color="#2b2f33" metalness={0.4} roughness={0.45} />;
  const panes = 4;
  const pw = (w1 - w0) / panes;
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * ((w0 + w1) / 2), 0, -BUILDING.wall / 2]}>
          <mesh position-y={(y0 + y1) / 2} raycast={noRaycast}>
            <planeGeometry args={[w1 - w0, y1 - y0]} />
            <meshStandardMaterial color="#bfe4ff" transparent opacity={0.28} roughness={0.05} metalness={0.5} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {/* Frame and the bars between panes */}
          {[y0, y1].map((y) => (
            <mesh key={y} position={[0, y, 0]} raycast={noRaycast}>
              <boxGeometry args={[w1 - w0 + 0.2, 0.2, BUILDING.wall + 0.1]} />
              {frame}
            </mesh>
          ))}
          {Array.from({ length: panes + 1 }, (_, i) => (
            <mesh key={i} position={[-(w1 - w0) / 2 + i * pw, (y0 + y1) / 2, 0]} raycast={noRaycast}>
              <boxGeometry args={[0.18, y1 - y0, BUILDING.wall + 0.1]} />
              {frame}
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** An orange metal canopy over the doors. */
function Canopy() {
  const w = BUILDING.doorHalf * 2 + 3;
  return (
    <group position={[0, BUILDING.doorHeight + 0.15, 1.6]}>
      <mesh rotation-x={0.12} castShadow raycast={noRaycast}>
        <boxGeometry args={[w, 0.25, 3.4]} />
        <Toon color={ORANGE} />
      </mesh>
      <mesh position={[0, -0.25, 1.65]} raycast={noRaycast}>
        <boxGeometry args={[w, 0.3, 0.12]} />
        <Toon color="#ffffff" />
      </mesh>
    </group>
  );
}

/** The OPEN / CLOSED sign that hangs inside the left door. */
function useOpenSign(title: string, line: string) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 160;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 256, 160);
    ctx.strokeStyle = "#c8102e";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 150);
    ctx.fillStyle = "#c8102e";
    ctx.textAlign = "center";
    ctx.font = "800 64px sans-serif";
    ctx.fillText(title, 128, 82);
    ctx.fillStyle = "#222";
    ctx.font = "600 22px sans-serif";
    ctx.fillText(line.slice(0, 22), 128, 128);
    return canvasTexture(c);
  }, [title, line]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/**
 * The double glass doors. They swing open by themselves when someone walks
 * up (camera.tsx sets doors.open), and shut again once they've gone. From the
 * drone view you can also tap them to fly straight in.
 */
function Doors({ onOpen, canEnter, openSign }: { onOpen: () => void; canEnter: boolean; openSign: { title: string; line: string } }) {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const sign = useOpenSign(openSign.title, openSign.line);
  const w = BUILDING.doorHalf;
  const h = BUILDING.doorHeight;

  useFrame((state, delta) => {
    const open = doors.open;
    const a = open ? 1.55 : 0;
    // Both swing inward, into the store.
    if (left.current) left.current.rotation.y = THREE.MathUtils.damp(left.current.rotation.y, a, 4, delta);
    if (right.current) right.current.rotation.y = THREE.MathUtils.damp(right.current.rotation.y, -a, 4, delta);
    // A soft pulse on the doorway while it's waiting to be tapped.
    if (glow.current) glow.current.opacity = canEnter && !open ? 0.18 + Math.sin(state.clock.elapsedTime * 3) * 0.12 : 0;
  });

  const tap = (e: ThreeEvent<MouseEvent>) => {
    if (!canEnter || e.delta > 8) return;
    e.stopPropagation();
    onOpen();
  };
  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!canEnter) return;
    e.stopPropagation();
    document.body.style.cursor = "pointer";
  };
  const out = () => (document.body.style.cursor = "");

  const door = (side: -1 | 1) => (
    <group>
      <mesh onClick={tap} onPointerOver={over} onPointerOut={out}>
        <boxGeometry args={[w - 0.12, h - 0.12, 0.08]} />
        <meshStandardMaterial color="#d5ecfb" transparent opacity={0.35} roughness={0.05} metalness={0.5} depthWrite={false} />
      </mesh>
      {[
        [0, h / 2 - 0.1, w, 0.2],
        [0, -h / 2 + 0.25, w, 0.5],
        [-w / 2 + 0.1, 0, 0.2, h],
        [w / 2 - 0.1, 0, 0.2, h],
      ].map(([x, y, fw, fh], i) => (
        <mesh key={i} position={[x, y, 0]} onClick={tap} onPointerOver={over} onPointerOut={out}>
          <boxGeometry args={[fw, fh, 0.14]} />
          <meshStandardMaterial color="#2b2f33" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* Push bar */}
      <mesh position={[0, -0.3, 0.12]} raycast={noRaycast}>
        <boxGeometry args={[w - 0.6, 0.14, 0.1]} />
        <meshStandardMaterial color="#c9ced3" metalness={0.9} roughness={0.2} />
      </mesh>
      {side === -1 && (
        <mesh position={[0, 0.9, 0.06]} raycast={noRaycast}>
          <planeGeometry args={[1.5, 0.94]} />
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
      )}
    </group>
  );

  return (
    <group position={[0, h / 2, -BUILDING.wall / 2]}>
      {/* Hinged at the outer edges, swinging inward */}
      <group ref={left} position-x={-w}>
        <group position-x={w / 2}>{door(-1)}</group>
      </group>
      <group ref={right} position-x={w}>
        <group position-x={-w / 2}>{door(1)}</group>
      </group>
      {/* "Tap here" glow in the doorway */}
      <mesh position-z={0.3} raycast={noRaycast}>
        <planeGeometry args={[w * 2 + 0.6, h + 0.4]} />
        <meshBasicMaterial ref={glow} color="#ffd21f" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---- Parking lot and surroundings -------------------------------------------------------------

/** One cartoon car: rounded body, glass cabin, chunky wheels, lights. */
export function Car({ color, position, turn = 0 }: { color: string; position: [number, number, number]; turn?: number }) {
  const body = <Toon color={color} />;
  return (
    <group position={position} rotation-y={turn}>
      <RoundedBox args={[3.4, 1.4, 7]} radius={0.45} smoothness={3} position-y={1.25} castShadow raycast={noRaycast}>
        {body}
      </RoundedBox>
      <RoundedBox args={[3.0, 1.35, 3.8]} radius={0.45} smoothness={3} position={[0, 2.35, 0.4]} castShadow raycast={noRaycast}>
        {body}
      </RoundedBox>
      {/* Windows (a dark glass band around the cabin) */}
      <RoundedBox args={[3.06, 0.8, 3.5]} radius={0.3} smoothness={2} position={[0, 2.4, 0.4]} raycast={noRaycast}>
        <meshStandardMaterial color="#27384a" roughness={0.15} metalness={0.4} />
      </RoundedBox>
      {[
        [-1.55, 2.25],
        [1.55, 2.25],
        [-1.55, -2.25],
        [1.55, -2.25],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0.75, z]} rotation-z={Math.PI / 2}>
          <mesh castShadow raycast={noRaycast}>
            <cylinderGeometry args={[0.75, 0.75, 0.55, 18]} />
            <Toon color="#222428" />
          </mesh>
          <mesh position-y={x > 0 ? 0.29 : -0.29} raycast={noRaycast}>
            <cylinderGeometry args={[0.38, 0.38, 0.04, 14]} />
            <Toon color="#d9dde1" />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 1.1, 1.35, -3.52]} raycast={noRaycast}>
            <boxGeometry args={[0.6, 0.3, 0.05]} />
            <meshBasicMaterial color="#fff6d6" toneMapped={false} />
          </mesh>
          <mesh position={[s * 1.1, 1.35, 3.52]} raycast={noRaycast}>
            <boxGeometry args={[0.6, 0.3, 0.05]} />
            <meshBasicMaterial color="#e2382a" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position-y={1.6} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[0.35, 0.5, 3.2, 8]} />
        <Toon color="#8a5a35" />
      </mesh>
      {[
        [0, 4.4, 0, 2.3],
        [1.2, 3.6, 0.4, 1.6],
        [-1.1, 3.8, -0.3, 1.7],
        [0.2, 5.6, -0.2, 1.5],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} castShadow raycast={noRaycast}>
          <icosahedronGeometry args={[r, 1]} />
          <meshToonMaterial color={i % 2 ? "#4c9a3b" : "#5cb045"} gradientMap={toonRamp()} />
        </mesh>
      ))}
    </group>
  );
}

function LampPost({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position-y={5} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[0.15, 0.22, 10, 10]} />
        <Toon color="#3b4046" />
      </mesh>
      <mesh position={[0, 10, 0.9]} raycast={noRaycast}>
        <boxGeometry args={[0.6, 0.3, 2.2]} />
        <Toon color="#3b4046" />
      </mesh>
      <mesh position={[0, 9.82, 1.6]} raycast={noRaycast}>
        <boxGeometry args={[0.45, 0.06, 0.8]} />
        <meshBasicMaterial color="#fff6d6" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Half the width of the parking lot (it's a bit wider than the store). */
export const LOT_HALF = BUILDING.halfWidth + 8;
const STALL_W = 4.4;
/** The left edge of each parking stall. */
const STALLS = Array.from({ length: Math.floor((LOT_HALF * 2 - 4) / STALL_W) }, (_, i) => -LOT_HALF + 2 + i * STALL_W);
const stallMid = (i: number) => STALLS[i] + STALL_W / 2;

/** The parked cars: colour, where they start, and which way they face. */
export const PARKED_CARS: { color: string; x: number; z: number; turn: number }[] = [
  { color: "#e5483b", x: stallMid(1), z: 10, turn: 0 },
  { color: "#13a8a0", x: stallMid(4), z: 10, turn: 0 },
  { color: "#ffd21f", x: stallMid(10), z: 10, turn: 0 },
  { color: "#ffffff", x: stallMid(13), z: 10, turn: 0 },
  { color: "#3d6fe0", x: stallMid(2), z: 27.5, turn: Math.PI },
  { color: "#ff7a2a", x: stallMid(7), z: 27.5, turn: Math.PI },
  { color: "#7b5cd6", x: stallMid(12), z: 27.5, turn: Math.PI },
];

/** Trees around the lot and the store: x, z, size. */
export const TREES: [number, number, number][] = [
  [-LOT_HALF - 10, 10, 1.2],
  [-LOT_HALF - 12, 24, 1],
  [LOT_HALF + 10, 12, 1.1],
  [LOT_HALF + 13, 27, 1.3],
  [-BUILDING.halfWidth - 8, -10, 1.2],
  [BUILDING.halfWidth + 8, -18, 1],
  [-BUILDING.halfWidth - 9, -34, 1.3],
  [BUILDING.halfWidth + 10, -38, 1.1],
  [-16, 42, 1],
  [12, 43, 1.2],
  [-LOT_HALF - 18, 0, 1.4],
  [LOT_HALF + 19, -4, 1.3],
];
/** Lamp posts at the corners of the lot. */
export const LAMPS: [number, number][] = [
  [-LOT_HALF - 1, 3],
  [LOT_HALF + 1, 3],
  [-LOT_HALF - 1, 34],
  [LOT_HALF + 1, 34],
];

/** The parking lot: asphalt, painted stalls, the sidewalk and curb, lamps, trees, grass. */
export function Lot() {
  const stallW = STALL_W;
  const rows = [
    { z0: 5.5, z1: 14.5 },
    { z0: 23, z1: 32 },
  ];
  const stalls = STALLS;

  const asphalt = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#4f545b";
    ctx.fillRect(0, 0, 128, 128);
    const rand = seededRandom(3);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.07)";
      ctx.fillRect(rand() * 128, rand() * 128, 2, 2);
    }
    return canvasTexture(c, [14, 7]);
  }, []);

  return (
    <group>
      {/* Grass all around */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.05} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[2600, 2600]} />
        <Toon color="#86c45a" />
      </mesh>
      {/* Asphalt */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 19]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[LOT_HALF * 2, 32]} />
        <meshStandardMaterial map={asphalt} roughness={0.95} />
      </mesh>
      {/* Sidewalk and curb along the front of the store */}
      <mesh position={[0, 0.15, 1.75]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[BUILDING.halfWidth * 2 + 8, 0.3, 3.5]} />
        <Toon color="#d9d5cc" />
      </mesh>
      {/* Painted stall lines */}
      {rows.flatMap((r, ri) =>
        [...stalls, stalls[stalls.length - 1] + stallW].map((x) => (
          <mesh key={`${ri}${x}`} rotation-x={-Math.PI / 2} position={[x, 0.03, (r.z0 + r.z1) / 2]} raycast={noRaycast}>
            <planeGeometry args={[0.22, r.z1 - r.z0]} />
            <meshBasicMaterial color="#f4f4f0" />
          </mesh>
        )),
      )}
      {/* Arrows painted in the driving lane */}
      {[-22, -7, 7, 22].map((x) => (
        <mesh key={x} rotation-x={-Math.PI / 2} position={[x, 0.03, 18.8]} raycast={noRaycast}>
          <planeGeometry args={[4.5, 0.35]} />
          <meshBasicMaterial color="#f4f4f0" />
        </mesh>
      ))}
      {/* The cars are drawn by <Cars> (in drive.tsx), so they can be driven. */}
      {LAMPS.map(([x, z]) => (
        <LampPost key={`${x}${z}`} position={[x, 0, z]} />
      ))}
      {TREES.map(([x, z, s]) => (
        <Tree key={`${x}${z}`} position={[x, 0, z]} scale={s} />
      ))}
    </group>
  );
}

/**
 * Blue sky that fades to pale at the horizon, with a few slow cartoon clouds.
 * At Halloween it's a late-afternoon sky instead: purple overhead, glowing
 * orange at the horizon.
 */
export function Sky({ spooky = false }: { spooky?: boolean }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    if (spooky) {
      g.addColorStop(0, "#4b4fb8");
      g.addColorStop(0.5, "#a77fd6");
      g.addColorStop(0.85, "#ffb27a");
      g.addColorStop(1, "#ffd9a8");
    } else {
      g.addColorStop(0, "#5fb7f2");
      g.addColorStop(0.55, "#a9dcfb");
      g.addColorStop(1, "#eaf7ff");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    return canvasTexture(c);
  }, [spooky]);
  const clouds = useRef<THREE.Group>(null);
  const dome = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (clouds.current) clouds.current.rotation.y += delta * 0.004;
    // The sky goes wherever you go (so you can never drive to the edge of it).
    dome.current?.position.set(state.camera.position.x, 0, state.camera.position.z);
  });
  return (
    <group ref={dome}>
      <mesh raycast={noRaycast}>
        <sphereGeometry args={[1100, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} fog={false} />
      </mesh>
      <group ref={clouds}>
        {[
          [-90, 70, -140, 1.4],
          [60, 85, -170, 1.1],
          [150, 65, -60, 1.3],
          [-160, 80, 40, 1.2],
          [20, 95, 160, 1],
          [120, 75, 120, 1.2],
        ].map(([x, y, z, s], i) => (
          <group key={i} position={[x * 2.4, y * 2, z * 2.4]} scale={s * 13}>
            {[
              [0, 0, 0, 1.4],
              [1.5, -0.2, 0.3, 1.1],
              [-1.4, -0.3, 0.2, 1],
              [0.6, 0.6, -0.2, 1],
            ].map(([cx, cy, cz, r], j) => (
              <mesh key={j} position={[cx, cy, cz]} raycast={noRaycast}>
                <icosahedronGeometry args={[r, 2]} />
                <meshToonMaterial color="#ffffff" gradientMap={toonRamp()} fog={false} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}

// ---- Inside the walls ------------------------------------------------------------------------

/** Light tiles for the store floor. */
function useFloorTiles() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#ece7dd" : "#f8f6f1";
        ctx.fillRect(x * 128, y * 128, 128, 128);
      }
    ctx.strokeStyle = "#d8d2c6";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 128, 0);
      ctx.lineTo(i * 128, 256);
      ctx.moveTo(0, i * 128);
      ctx.lineTo(256, i * 128);
      ctx.stroke();
    }
    // About one 3-unit tile each way, whatever the store's size.
    return canvasTexture(c, [Math.round((INSIDE.right - INSIDE.left) / 3), Math.round((INSIDE.front - INSIDE.back) / 3)]);
  }, []);
}

/** The store's floor, a doormat, ceiling lights, and colour bands on the walls. */
export function Interior() {
  const tiles = useFloorTiles();
  const W = INSIDE.right - INSIDE.left;
  const D = INSIDE.front - INSIDE.back;
  const mid = (INSIDE.front + INSIDE.back) / 2;
  const mat = signTexture(brand.name, { bg: "#2d3136", fg: "#ffffff", height: 96, pad: 0.4 });
  const panelGlow = useMemo(() => new THREE.Color("#ffffff").multiplyScalar(1.25), []);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, mid]} raycast={noRaycast}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={tiles} roughness={0.35} metalness={0.05} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, -2.6]} raycast={noRaycast}>
        <planeGeometry args={[7, 3.4]} />
        <meshBasicMaterial map={mat.texture} />
      </mesh>
      {/* Long ceiling light panels */}
      {[-5, -12, -19, -26, -33].map((z) =>
        [-16, -5.5, 5.5, 16].map((x) => (
          <mesh key={`${x}${z}`} position={[x, BUILDING.height - 0.05, z]} rotation-x={Math.PI / 2} raycast={noRaycast}>
            <planeGeometry args={[9, 1.1]} />
            <meshBasicMaterial color={panelGlow} toneMapped={false} />
          </mesh>
        )),
      )}
      {/* Orange and teal bands around the walls */}
      {[
        [9.6, ORANGE],
        [9.15, TEAL],
      ].map(([y, color]) => (
        <group key={String(y)}>
          <mesh position={[0, Number(y), INSIDE.back + 0.02]} raycast={noRaycast}>
            <planeGeometry args={[W, 0.35]} />
            <meshStandardMaterial color={String(color)} roughness={0.6} />
          </mesh>
          <mesh position={[INSIDE.left + 0.02, Number(y), mid]} rotation-y={Math.PI / 2} raycast={noRaycast}>
            <planeGeometry args={[D, 0.35]} />
            <meshStandardMaterial color={String(color)} roughness={0.6} />
          </mesh>
          <mesh position={[INSIDE.right - 0.02, Number(y), mid]} rotation-y={-Math.PI / 2} raycast={noRaycast}>
            <planeGeometry args={[D, 0.35]} />
            <meshStandardMaterial color={String(color)} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
