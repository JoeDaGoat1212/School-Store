"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GUARD_LOOK, Humanoid, PLAYER_LOOK, PRISONER_LOOK, newPose, type Look } from "./humanoid";
import { jail, type Guard } from "./jail-state";
import {
  CELL,
  CELL_COUNT,
  CELL_DOORS,
  CELL_ROWS,
  CELL_X0,
  CELL_X1,
  EXIT,
  HALL,
  INMATES,
  JAIL_BOX,
  JAIL_DOORS,
  JAIL_ROOMS,
  JAIL_SOLID,
  MESS_HALL,
  MESS_TABLE,
  MESS_TABLES,
  MY_CELL,
  YARD,
  YARD_FENCE,
  cellAt,
  doorOpen,
  type JailDoor,
} from "./jail-layout";
import { canvasTexture, noRaycast, seededRandom, signTexture } from "./paint";
import { Instances, type Place } from "./town";
import * as fx from "./buildings";
import { Near } from "./near";
import { Static } from "./static-merge";

/*
 * Draws the jail from jail-layout.ts: stained concrete walls, four cell blocks
 * of 25 cells (bunks, steel toilets, barred sliding doors), the mess hall
 * with its tables and serving counter, the main hall, the gym (weights,
 * bench presses, treadmills, punching bags), the library, the laundry, the
 * guard room (CCTV screens, lockers), the lobby, steel security doors with
 * red/green keycard lights, and the fenced yard with razor wire, basketball
 * courts and watchtowers. Plus the guards and the other inmates.
 */

const H = JAIL_BOX.h;
const B = JAIL_BOX;

/** Grimy, stained concrete (a canvas texture, so it isn't flat paint). */
function concreteTexture(seed: number, base: [number, number, number], repeat: [number, number]) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const rnd = seededRandom(seed);
  g.fillStyle = `rgb(${base.join(",")})`;
  g.fillRect(0, 0, 256, 256);
  // Blotches and stains.
  for (let i = 0; i < 260; i++) {
    const v = (rnd() - 0.5) * 26;
    g.fillStyle = `rgba(${base.map((b) => Math.round(b + v)).join(",")},${0.18 + rnd() * 0.2})`;
    const r = 4 + rnd() * 26;
    g.beginPath();
    g.arc(rnd() * 256, rnd() * 256, r, 0, Math.PI * 2);
    g.fill();
  }
  // Fine grit.
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // Drip streaks from the top.
  for (let i = 0; i < 18; i++) {
    const x = rnd() * 256;
    const grad = g.createLinearGradient(0, 0, 0, 60 + rnd() * 120);
    grad.addColorStop(0, "rgba(40,36,30,0.22)");
    grad.addColorStop(1, "rgba(40,36,30,0)");
    g.fillStyle = grad;
    g.fillRect(x, 0, 2 + rnd() * 5, 200);
  }
  // Formwork lines.
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = 1.5;
  g.strokeRect(0, 0, 256, 256);
  return canvasTexture(c, repeat);
}

const mat = {
  concrete: new THREE.MeshStandardMaterial({ color: "#a8a49b", roughness: 0.95 }),
  inner: new THREE.MeshStandardMaterial({ color: "#c9c4b6", roughness: 0.9 }),
  steel: new THREE.MeshStandardMaterial({ color: "#6f767e", roughness: 0.38, metalness: 0.8 }),
  dark: new THREE.MeshStandardMaterial({ color: "#24272b", roughness: 0.55, metalness: 0.35 }),
  orange: new THREE.MeshStandardMaterial({ color: "#c8641e", roughness: 0.8 }),
  blue: new THREE.MeshStandardMaterial({ color: "#34465f", roughness: 0.7 }),
  mat: new THREE.MeshStandardMaterial({ color: "#2f3338", roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: "#6b5440", roughness: 0.75 }),
  white: new THREE.MeshStandardMaterial({ color: "#d9dcdf", roughness: 0.35, metalness: 0.1 }),
};
export function Jail() {
  return (
    <group>
      <Shell />
      <Facade />
      <Yard />
      {/* Inside: only drawn when you're nearby. */}
      <Near x={(B.x0 + B.x1) / 2} z={(B.z0 + B.z1) / 2} dist={340}>
        <Cells />
        {JAIL_DOORS.filter((d) => d.kind === "security").map((d) => (
          <SecurityDoor key={d.id} door={d} />
        ))}
        <MessHall />
        <Gym />
        <Library />
        <Laundry />
        <GuardRoom />
        <Lobby />
        <HallSigns />
        {jail.guards.map((g, i) => (
          <GuardModel key={i} guard={g} />
        ))}
        {INMATES.map((p, i) => (
          <Inmate key={i} {...p} n={i} />
        ))}
      </Near>
    </group>
  );
}

// ---- Walls, floor, roof, signs ------------------------------------------------------------------

const placeWall: Place = (i, o) => {
  const w = JAIL_SOLID[i];
  o.position.set(w.x, H / 2, w.z);
  o.scale.set(w.hw * 2, H, w.hd * 2);
};

/** Fluorescent strip lights down every corridor and the main hall. */
const LIGHTS = [
  ...CELL_ROWS.flatMap((row) => Array.from({ length: 12 }, (_, i) => ({ x: CELL_X0 + 12 + i * 21, z: (row.corridor.z0 + row.corridor.z1) / 2 }))),
  ...Array.from({ length: 21 }, (_, i) => ({ x: B.x0 + 12 + i * 21, z: (HALL.z0 + HALL.z1) / 2 })),
  ...Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => ({ x: MESS_HALL.x0 + 25 + i * 45, z: MESS_HALL.z0 + 14 + j * 24 }))).flat(),
];
const placeLight: Place = (i, o) => {
  o.position.set(LIGHTS[i].x, H - 0.15, LIGHTS[i].z);
  o.scale.set(6, 0.15, 0.5);
};

function Shell() {
  const tiles = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const rnd = seededRandom(5);
    // Worn vinyl tiles: each a slightly different grey, scuffed.
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const v = 128 + Math.round((rnd() - 0.5) * 18);
        g.fillStyle = `rgb(${v + 4},${v + 4},${v})`;
        g.fillRect(x * 128, y * 128, 128, 128);
      }
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(30,30,30,${0.05 + rnd() * 0.08})`;
      g.lineWidth = 1 + rnd() * 2;
      g.beginPath();
      const x = rnd() * 256;
      const y = rnd() * 256;
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 10);
      g.stroke();
    }
    g.strokeStyle = "rgba(60,60,60,0.55)";
    g.lineWidth = 2;
    for (const p of [0, 128, 256]) {
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, 256);
      g.moveTo(0, p);
      g.lineTo(256, p);
      g.stroke();
    }
    return canvasTexture(c, [(B.x1 - B.x0) / 6, (B.z1 - B.z0) / 6]);
  }, []);
  const roofTex = useMemo(() => concreteTexture(31, [120, 120, 118], [(B.x1 - B.x0) / 20, (B.z1 - B.z0) / 20]), []);
  return (
    <group>
      <Instances count={JAIL_SOLID.length} place={placeWall} castShadow receiveShadow>
        <boxGeometry />
        <primitive object={mat.concrete} attach="material" />
      </Instances>
      {/* Floor and roof */}
      <mesh rotation-x={-Math.PI / 2} position={[(B.x0 + B.x1) / 2, 0.05, (B.z0 + B.z1) / 2]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[B.x1 - B.x0, B.z1 - B.z0]} />
        <meshStandardMaterial map={tiles} roughness={0.55} />
      </mesh>
      <mesh position={[(B.x0 + B.x1) / 2, H + 0.3, (B.z0 + B.z1) / 2]} castShadow raycast={noRaycast}>
        <boxGeometry args={[B.x1 - B.x0 + 1, 0.6, B.z1 - B.z0 + 1]} />
        <meshStandardMaterial map={roofTex} roughness={0.95} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[(B.x0 + B.x1) / 2, H - 0.02, (B.z0 + B.z1) / 2]} raycast={noRaycast}>
        <planeGeometry args={[B.x1 - B.x0, B.z1 - B.z0]} />
        <primitive object={mat.inner} attach="material" />
      </mesh>
      {/* Rooftop units (air handling) */}
      <Static>
        {Array.from({ length: 8 }, (_, i) => (
          <group key={i} position={[B.x0 + 40 + i * 52, H + 0.6, B.z0 + 40 + (i % 3) * 50]}>
            <fx.Block x0={-4} x1={4} y0={0} y1={2.6} z0={-3} z1={3} m={fx.mat("#8d9196", 0.6, 0.4)} />
            <fx.Cyl x={0} y={3} z={0} r={1.6} h={0.8} m={fx.mat("#55595e", 0.5, 0.5)} />
          </group>
        ))}
      </Static>
      {/* Strip lights */}
      <Instances count={LIGHTS.length} place={placeLight}>
        <boxGeometry />
        <meshBasicMaterial color="#eef6ff" toneMapped={false} />
      </Instances>
    </group>
  );
}

// ---- The front: a proper prison entrance ------------------------------------------------------

function Facade() {
  const z = B.z1;
  const title = useMemo(() => signTexture("County Correctional Facility", { bg: "transparent", fg: "#e9ecef", height: 128 }), []);
  const band = fx.mat("#5f636a", 0.85);
  const brick = fx.mat("#6e4a3c", 0.92);
  const glass = fx.mat("#1d2731", 0.12, 0.6);
  const flag = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 1.3) * 0.18;
  });
  const windows = Array.from({ length: Math.floor((B.x1 - B.x0 - 12) / 7) }, (_, i) => B.x0 + 6 + i * 7).filter((x) => Math.abs(x - EXIT.x) > 11);
  return (
    <group>
      <Static>
        {/* Brick banding along the front, and a row of tall slit windows */}
        <fx.Block x0={B.x0} x1={B.x1} y0={0} y1={1.4} z0={z} z1={z + 0.3} m={brick} />
        <fx.Block x0={B.x0} x1={B.x1} y0={H - 1.2} y1={H} z0={z} z1={z + 0.35} m={band} />
        {windows.map((x) => (
          <group key={x}>
            <fx.Block x0={x - 0.35} x1={x + 0.35} y0={2.4} y1={7.6} z0={z} z1={z + 0.12} m={glass} />
            {[-0.2, 0, 0.2].map((b) => (
              <fx.Block key={b} x0={x + b - 0.04} x1={x + b + 0.04} y0={2.4} y1={7.6} z0={z + 0.1} z1={z + 0.18} m={band} />
            ))}
          </group>
        ))}
        {/* The entrance: a concrete portico over the doors, steps, and lamps */}
        <group position={[EXIT.x, 0, z]}>
          <fx.Block x0={-9} x1={9} y0={H - 1} y1={H + 0.4} z0={0} z1={7} m={band} />
          {[-8, -3.6, 3.6, 8].map((x) => (
            <fx.Block key={x} x0={x - 0.45} x1={x + 0.45} y0={0} y1={H - 1} z0={6} z1={6.9} m={fx.mat("#b8bcc1", 0.7)} />
          ))}
          <fx.Block x0={-9.5} x1={9.5} y0={0} y1={0.3} z0={0} z1={8} m={fx.mat("#a8a59d", 0.9)} />
        </group>
        {/* Watchtowers on the front corners */}
        {[B.x0 + 2, B.x1 - 2].map((x) => (
          <group key={x} position={[x, 0, z - 2]}>
            <fx.Block x0={-2} x1={2} y0={0} y1={H + 6} z0={-2} z1={2} m={fx.mat("#8f948f", 0.9)} />
            <fx.Block x0={-3} x1={3} y0={H + 6} y1={H + 9} z0={-3} z1={3} m={glass} />
            <fx.Block x0={-3.4} x1={3.4} y0={H + 9} y1={H + 9.6} z0={-3.4} z1={3.4} m={band} />
          </group>
        ))}
      </Static>
      {/* The name across the top */}
      <mesh position={[(B.x0 + B.x1) / 2 - 60, H - 2.2, z + 0.4]} raycast={noRaycast}>
        <planeGeometry args={[70, 70 / title.aspect]} />
        <meshBasicMaterial map={title.texture} transparent />
      </mesh>
      {[-4.6, 4.6].map((x) => (
        <mesh key={x} position={[EXIT.x + x, H - 1.4, z + 3]} raycast={noRaycast}>
          <boxGeometry args={[0.6, 0.3, 0.6]} />
          <meshStandardMaterial color="#ffffff" emissive="#fff1cf" emissiveIntensity={1.4} />
        </mesh>
      ))}
      {/* Flagpoles */}
      {[EXIT.x - 26, EXIT.x + 26].map((x, i) => (
        <group key={x} position={[x, 0, z + 14]}>
          <fx.Cyl x={0} y={7} z={0} r={0.12} h={14} m={fx.mat("#b9bdc2", 0.3, 0.8)} />
          <mesh ref={i ? undefined : flag} position={[1.6, 12.6, 0]} raycast={noRaycast}>
            <planeGeometry args={[3.2, 2]} />
            <meshStandardMaterial color={i ? "#1f3a5f" : "#a3172b"} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      {[B.x0 + 2, B.x1 - 2].map((x) => (
        <mesh key={x} position={[x, H + 10.2, z - 2]} raycast={noRaycast}>
          <sphereGeometry args={[0.5, 10, 8]} />
          <meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={1.5} />
        </mesh>
      ))}
    </group>
  );
}

// ---- The cells ------------------------------------------------------------------------------

/** Bars across the front of each cell (the bit either side of its door). */
const BARS = (() => {
  const out: { x: number; z: number }[] = [];
  for (let n = 0; n < CELL_COUNT; n++) {
    const c = cellAt(n);
    const x0 = CELL_X0 + CELL.w * c.i;
    for (let x = x0 + 0.4; x < x0 + CELL.w - 0.2; x += 0.45) if (Math.abs(x - c.x) > 2.1) out.push({ x, z: c.row.z1 });
  }
  return out;
})();
const placeBar: Place = (i, o) => {
  o.position.set(BARS[i].x, 3.5, BARS[i].z);
};
/** Beds, mattresses, toilets and sinks: a bunk bed, a toilet and a sink per cell. */
const cellCorner = (n: number) => {
  const c = cellAt(n);
  return { x: CELL_X0 + CELL.w * c.i, z: c.row.z0 };
};
const placeBunk = (y: number): Place => (i, o) => {
  const c = cellCorner(i);
  o.position.set(c.x + 2.2, y, c.z + 3.4);
  o.scale.set(3, 0.3, 6.4);
};
const placeMattress = (y: number): Place => (i, o) => {
  const c = cellCorner(i);
  o.position.set(c.x + 2.2, y, c.z + 3.4);
  o.scale.set(2.8, 0.35, 6.1);
};
const placePost: Place = (i, o) => {
  const c = cellCorner(Math.floor(i / 4));
  const k = i % 4;
  o.position.set(c.x + 2.2 + (k % 2 ? 1.4 : -1.4), 2.1, c.z + 3.4 + (k < 2 ? 3.1 : -3.1));
  o.scale.set(0.15, 4.2, 0.15);
};
const placeToilet: Place = (i, o) => {
  const c = cellCorner(i);
  o.position.set(c.x + 8, 0.7, c.z + 1.2);
};
const placeSink: Place = (i, o) => {
  const c = cellCorner(i);
  o.position.set(c.x + 8.6, 2.4, c.z + 3.2);
  o.scale.set(1.2, 0.5, 1.4);
};

/** The other 99 cell doors never open (only yours does), so they're drawn all at once: their bars, and the rails across them. */
const SHUT_DOORS = CELL_DOORS.filter((d) => d.id !== `cell-${MY_CELL}`);
const DOOR_BAR_X = Array.from({ length: 9 }, (_, i) => -2 + 0.25 + i * ((4 - 0.5) / 8));
const placeDoorBar: Place = (i, o) => {
  const d = SHUT_DOORS[Math.floor(i / DOOR_BAR_X.length)];
  o.position.set(d.x + DOOR_BAR_X[i % DOOR_BAR_X.length], 3.5, d.z + 0.2);
};
const placeDoorRail: Place = (i, o) => {
  const d = SHUT_DOORS[Math.floor(i / 2)];
  o.position.set(d.x, i % 2 ? 6.6 : 1, d.z + 0.2);
  o.scale.set(d.half * 2, 0.18, 0.18);
};

function Cells() {
  const bed = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5d6b5f", roughness: 0.95 }), []);
  return (
    <group>
      <Instances count={BARS.length} place={placeBar}>
        <cylinderGeometry args={[0.06, 0.06, 7, 6]} />
        <primitive object={mat.steel} attach="material" />
      </Instances>
      <Instances count={CELL_COUNT} place={placeBunk(1.1)} castShadow>
        <boxGeometry />
        <primitive object={mat.steel} attach="material" />
      </Instances>
      <Instances count={CELL_COUNT} place={placeBunk(3.4)} castShadow>
        <boxGeometry />
        <primitive object={mat.steel} attach="material" />
      </Instances>
      <Instances count={CELL_COUNT} place={placeMattress(1.42)}>
        <boxGeometry />
        <primitive object={bed} attach="material" />
      </Instances>
      <Instances count={CELL_COUNT} place={placeMattress(3.72)}>
        <boxGeometry />
        <primitive object={bed} attach="material" />
      </Instances>
      <Instances count={CELL_COUNT * 4} place={placePost}>
        <boxGeometry />
        <primitive object={mat.steel} attach="material" />
      </Instances>
      <Instances count={CELL_COUNT} place={placeToilet}>
        <cylinderGeometry args={[0.6, 0.45, 1.4, 12]} />
        <meshStandardMaterial color="#c9cfd5" roughness={0.18} metalness={0.75} />
      </Instances>
      <Instances count={CELL_COUNT} place={placeSink}>
        <boxGeometry />
        <meshStandardMaterial color="#c9cfd5" roughness={0.18} metalness={0.75} />
      </Instances>
      {/* A rail across the top of each row of cell fronts, and the block's letter */}
      {CELL_ROWS.map((row) => (
        <group key={row.r}>
          <mesh position={[(CELL_X0 + CELL_X1) / 2, 7.05, row.z1]} raycast={noRaycast}>
            <boxGeometry args={[CELL_X1 - CELL_X0, 0.3, 0.3]} />
            <primitive object={mat.steel} attach="material" />
          </mesh>
          <BlockSign letter={row.letter} z={(row.corridor.z0 + row.corridor.z1) / 2} />
        </group>
      ))}
      {/* Cell numbers */}
      {Array.from({ length: CELL_COUNT }, (_, n) => (
        <CellNumber key={n} n={n} />
      ))}
      <Instances count={SHUT_DOORS.length * DOOR_BAR_X.length} place={placeDoorBar}>
        <cylinderGeometry args={[0.07, 0.07, 7, 6]} />
        <primitive object={mat.steel} attach="material" />
      </Instances>
      <Instances count={SHUT_DOORS.length * 2} place={placeDoorRail}>
        <boxGeometry />
        <primitive object={mat.steel} attach="material" />
      </Instances>
      {/* Yours slides open */}
      {CELL_DOORS.filter((d) => d.id === `cell-${MY_CELL}`).map((d) => (
        <CellDoor key={d.id} door={d} />
      ))}
    </group>
  );
}

function CellNumber({ n }: { n: number }) {
  const c = cellAt(n);
  const t = useMemo(() => signTexture(`${c.row.letter}${String(c.i + 1).padStart(2, "0")}`, { bg: "#d8d2c2", fg: "#1b1d21", height: 64 }), [c.row.letter, c.i]);
  // (Only drawn up close: there are a hundred of them.)
  const sign = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    if (sign.current) sign.current.visible = (camera.position.x - c.x) ** 2 + (camera.position.z - c.z) ** 2 < 60 * 60;
  });
  return (
    <mesh ref={sign} position={[c.x, 8, c.row.z1 + 0.2]} raycast={noRaycast}>
      <planeGeometry args={[1.1 * t.aspect, 1.1]} />
      <meshBasicMaterial map={t.texture} transparent />
    </mesh>
  );
}

/** "BLOCK A" painted at the mess hall end of each corridor. */
function BlockSign({ letter, z }: { letter: string; z: number }) {
  const t = useMemo(() => signTexture(`Block ${letter}`, { bg: "#7a1f1f", fg: "#f2efe6", height: 96 }), [letter]);
  return (
    <mesh position={[CELL_X1 - 0.3, 7.5, z]} rotation-y={Math.PI / 2} raycast={noRaycast}>
      <planeGeometry args={[2.4 * t.aspect, 2.4]} />
      <meshBasicMaterial map={t.texture} transparent />
    </mesh>
  );
}

/** A cell door: bars that slide sideways. */
function CellDoor({ door }: { door: JailDoor }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.position.x = door.x + doorOpen[door.id] * door.half * 2;
  });
  const bars = Array.from({ length: 9 }, (_, i) => -door.half + 0.25 + i * ((door.half * 2 - 0.5) / 8));
  return (
    <group ref={g} position={[door.x, 0, door.z + 0.2]}>
      {bars.map((x) => (
        <mesh key={x} position={[x, 3.5, 0]} material={mat.steel} raycast={noRaycast}>
          <cylinderGeometry args={[0.07, 0.07, 7, 6]} />
        </mesh>
      ))}
      {[1, 6.6].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={mat.steel} raycast={noRaycast}>
          <boxGeometry args={[door.half * 2, 0.18, 0.18]} />
        </mesh>
      ))}
    </group>
  );
}

/** A steel security door with a keycard reader: red light while it's locked, green when it opens. */
function SecurityDoor({ door }: { door: JailDoor }) {
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  const lamp = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const o = doorOpen[door.id];
    if (left.current) left.current.position.x = -door.half / 2 - o * door.half;
    if (right.current) right.current.position.x = door.half / 2 + o * door.half;
    lamp.current?.color.set(o > 0.5 ? "#2bff6a" : "#ff2a1a");
  });
  const h = 7;
  return (
    <group position={[door.x, 0, door.z]}>
      {[left, right].map((ref, k) => (
        <mesh key={k} ref={ref} position={[(k ? 1 : -1) * (door.half / 2), h / 2, 0]} material={mat.steel} castShadow raycast={noRaycast}>
          <boxGeometry args={[door.half, h, 0.35]} />
        </mesh>
      ))}
      {/* Over the door, and the keycard reader beside it (both sides) */}
      <mesh position={[0, (h + H) / 2, 0]} material={mat.concrete} raycast={noRaycast}>
        <boxGeometry args={[door.half * 2, H - h, 1]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[door.half + 0.6, 3.6, s * 0.56]}>
          <mesh material={mat.dark} raycast={noRaycast}>
            <boxGeometry args={[0.5, 0.8, 0.1]} />
          </mesh>
          <mesh position={[0, 0.22, s * 0.06]} raycast={noRaycast}>
            <boxGeometry args={[0.2, 0.12, 0.04]} />
            <meshBasicMaterial ref={s > 0 ? lamp : undefined} color="#ff2a1a" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---- The rooms ------------------------------------------------------------------------------

const placeTable: Place = (i, o) => {
  o.position.set(MESS_TABLES[i].x, 1.45, MESS_TABLES[i].z);
  o.scale.set(MESS_TABLE.w, 0.2, MESS_TABLE.d);
};
const placeTableLeg: Place = (i, o) => {
  const t = MESS_TABLES[Math.floor(i / 2)];
  o.position.set(t.x + (i % 2 ? 4 : -4), 0.7, t.z);
  o.scale.set(0.3, 1.4, 1.2);
};
const placeBench: Place = (i, o) => {
  const t = MESS_TABLES[Math.floor(i / 2)];
  o.position.set(t.x, 0.78, t.z + (i % 2 ? MESS_TABLE.bench : -MESS_TABLE.bench));
  o.scale.set(MESS_TABLE.w, 0.18, 0.9);
};

function MessHall() {
  const M = MESS_HALL;
  return (
    <group>
      <Instances count={MESS_TABLES.length} place={placeTable} castShadow>
        <boxGeometry />
        <primitive object={mat.steel} attach="material" />
      </Instances>
      <Instances count={MESS_TABLES.length * 2} place={placeTableLeg}>
        <boxGeometry />
        <primitive object={mat.dark} attach="material" />
      </Instances>
      <Instances count={MESS_TABLES.length * 2} place={placeBench}>
        <boxGeometry />
        <primitive object={mat.steel} attach="material" />
      </Instances>
      {/* The serving counter along the east wall, with steel trays */}
      <Static>
        <fx.Block x0={M.x1 - 4} x1={M.x1} y0={0} y1={2.2} z0={M.z0 + 20} z1={M.z1 - 20} m={mat.steel} />
        <fx.Block x0={M.x1 - 4.2} x1={M.x1} y0={2.2} y1={2.35} z0={M.z0 + 20} z1={M.z1 - 20} m={mat.white} />
        <fx.Block x0={M.x1 - 0.6} x1={M.x1} y0={2.35} y1={6} z0={M.z0 + 20} z1={M.z1 - 20} m={mat.white} />
      </Static>
      <WallSign text="Mess Hall" x={(M.x0 + M.x1) / 2} z={M.z1 - 0.6} turn={Math.PI} />
    </group>
  );
}

function Gym() {
  const r = JAIL_ROOMS.gym;
  const bags = useRef<THREE.Group>(null);
  useFrame((state) => {
    bags.current?.children.forEach((b, i) => (b.rotation.z = Math.sin(state.clock.elapsedTime * 1.7 + i) * 0.08));
  });
  const cx = (r.x0 + r.x1) / 2;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0.07, (r.z0 + r.z1) / 2]} material={mat.mat} raycast={noRaycast}>
        <planeGeometry args={[r.x1 - r.x0 - 10, r.z1 - r.z0 - 14]} />
      </mesh>
      {/* Bench presses with barbells */}
      {Array.from({ length: 6 }, (_, i) => r.x0 + 12 + i * 18).map((x) => (
        <group key={x} position={[x, 0, -50]}>
          <mesh position-y={1} material={mat.blue} raycast={noRaycast}>
            <boxGeometry args={[1.4, 0.4, 4.4]} />
          </mesh>
          {[-0.9, 0.9].map((s) => (
            <mesh key={s} position={[s, 2.2, -1.6]} material={mat.steel} raycast={noRaycast}>
              <boxGeometry args={[0.15, 2.4, 0.15]} />
            </mesh>
          ))}
          <mesh position={[0, 3.3, -1.6]} rotation-z={Math.PI / 2} material={mat.steel} raycast={noRaycast}>
            <cylinderGeometry args={[0.07, 0.07, 6, 8]} />
          </mesh>
          {[-2.4, 2.4].map((s) => (
            <mesh key={s} position={[s, 3.3, -1.6]} rotation-z={Math.PI / 2} material={mat.dark} raycast={noRaycast}>
              <cylinderGeometry args={[0.8, 0.8, 0.3, 18]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Dumbbell racks */}
      {[cx - 25, cx + 25].map((x) => (
        <group key={x} position={[x, 0, r.z1 - 4]}>
          <mesh position-y={1.4} material={mat.dark} raycast={noRaycast}>
            <boxGeometry args={[10, 0.25, 1.6]} />
          </mesh>
          {Array.from({ length: 8 }, (_, i) => (
            <group key={i} position={[-4.2 + i * 1.2, 1.75, 0]}>
              <mesh rotation-z={Math.PI / 2} material={mat.steel} raycast={noRaycast}>
                <cylinderGeometry args={[0.06, 0.06, 1, 6]} />
              </mesh>
              {[-0.42, 0.42].map((s) => (
                <mesh key={s} position-x={s} rotation-z={Math.PI / 2} material={mat.dark} raycast={noRaycast}>
                  <cylinderGeometry args={[0.22 + i * 0.015, 0.22 + i * 0.015, 0.2, 10]} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
      {/* Treadmills */}
      {Array.from({ length: 8 }, (_, i) => r.x0 + 14 + i * 12).map((x) => (
        <group key={x} position={[x, 0, 6]}>
          <mesh position-y={0.4} material={mat.dark} raycast={noRaycast}>
            <boxGeometry args={[2.2, 0.5, 5]} />
          </mesh>
          <mesh position={[0, 2.4, -2.2]} material={mat.steel} raycast={noRaycast}>
            <boxGeometry args={[2, 0.15, 0.4]} />
          </mesh>
          {[-0.9, 0.9].map((s) => (
            <mesh key={s} position={[s, 1.4, -2.2]} material={mat.steel} raycast={noRaycast}>
              <boxGeometry args={[0.12, 2.2, 0.12]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Punching bags */}
      <group ref={bags}>
        {[r.x1 - 10, r.x1 - 20, r.x1 - 30].map((x) => (
          <group key={x} position={[x, H, -15]}>
            <mesh position-y={-1.5} material={mat.dark} raycast={noRaycast}>
              <cylinderGeometry args={[0.04, 0.04, 3, 6]} />
            </mesh>
            <mesh position-y={-4.3} raycast={noRaycast}>
              <capsuleGeometry args={[0.9, 2.6, 6, 14]} />
              <meshStandardMaterial color="#5a1d18" roughness={0.6} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function Library() {
  const r = JAIL_ROOMS.library;
  const books = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d")!;
    const rnd = seededRandom(41);
    g.fillStyle = "#2a2118";
    g.fillRect(0, 0, 256, 128);
    for (let shelf = 0; shelf < 4; shelf++) {
      let x = 0;
      while (x < 256) {
        const w = 4 + rnd() * 7;
        const hue = Math.floor(rnd() * 360);
        g.fillStyle = `hsl(${hue},${20 + rnd() * 30}%,${22 + rnd() * 25}%)`;
        g.fillRect(x, shelf * 32 + 4 + rnd() * 6, w - 1, 26);
        x += w;
      }
    }
    return canvasTexture(c, [1, 1]);
  }, []);
  return (
    <group>
      {/* Shelves of books along both walls, and reading tables */}
      {[r.x0 + 1.2, r.x1 - 1.2].map((x, k) =>
        Array.from({ length: 8 }, (_, i) => (
          <mesh key={`${k}-${i}`} position={[x, 3, r.z0 + 10 + i * 12]} rotation-y={k ? -Math.PI / 2 : Math.PI / 2} raycast={noRaycast}>
            <boxGeometry args={[10, 6, 1.6]} />
            <meshStandardMaterial map={books} roughness={0.85} />
          </mesh>
        )),
      )}
      {Array.from({ length: 4 }, (_, i) => (
        <group key={i} position={[(r.x0 + r.x1) / 2, 0, r.z0 + 18 + i * 22]}>
          <fx.Block x0={-6} x1={6} y0={1.5} y1={1.7} z0={-2} z1={2} m={mat.wood} />
          <fx.Block x0={-5.5} x1={-5} y0={0} y1={1.5} z0={-1.5} z1={1.5} m={mat.dark} />
          <fx.Block x0={5} x1={5.5} y0={0} y1={1.5} z0={-1.5} z1={1.5} m={mat.dark} />
        </group>
      ))}
    </group>
  );
}

function Laundry() {
  const r = JAIL_ROOMS.laundry;
  return (
    <group>
      {/* Two rows of big washers and dryers, and a folding table */}
      {[r.x0 + 3, r.x1 - 3].map((x, k) =>
        Array.from({ length: 9 }, (_, i) => (
          <group key={`${k}-${i}`} position={[x, 0, r.z0 + 12 + i * 10]} rotation-y={k ? -Math.PI / 2 : Math.PI / 2}>
            <mesh position-y={2} material={mat.white} raycast={noRaycast}>
              <boxGeometry args={[4, 4, 3.6]} />
            </mesh>
            <mesh position={[0, 2.2, 1.82]} raycast={noRaycast}>
              <circleGeometry args={[1.1, 24]} />
              <meshStandardMaterial color="#26313a" roughness={0.1} metalness={0.4} />
            </mesh>
          </group>
        )),
      )}
      <Static>
        <fx.Block x0={(r.x0 + r.x1) / 2 - 3} x1={(r.x0 + r.x1) / 2 + 3} y0={1.8} y1={2} z0={r.z0 + 20} z1={r.z1 - 20} m={mat.steel} />
      </Static>
    </group>
  );
}

function GuardRoom() {
  const r = JAIL_ROOMS.guards;
  const cx = (r.x0 + r.x1) / 2;
  return (
    <group>
      {/* Desk with a wall of CCTV screens */}
      <group position={[cx, 0, r.z0 + 30]}>
        <mesh position-y={1.4} material={mat.dark} raycast={noRaycast}>
          <boxGeometry args={[16, 0.25, 3]} />
        </mesh>
        <mesh position-y={0.7} material={mat.steel} raycast={noRaycast}>
          <boxGeometry args={[15.6, 1.4, 2.6]} />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} position={[-6 + (i % 6) * 2.4, 2.6 + Math.floor(i / 6) * 1.5, -1]} raycast={noRaycast}>
            <boxGeometry args={[2.1, 1.3, 0.1]} />
            <meshBasicMaterial color={["#3a4a44", "#2f3a48", "#414a3c"][i % 3]} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* Lockers */}
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[r.x0 + 4 + i * 2.1, 2.5, r.z1 - 1.4]} material={mat.blue} raycast={noRaycast}>
          <boxGeometry args={[2, 5, 1.4]} />
        </mesh>
      ))}
    </group>
  );
}

function Lobby() {
  const r = JAIL_ROOMS.lobby;
  return (
    <group>
      {/* Front desk behind glass */}
      <group position={[r.x1 - 10, 0, r.z1 - 20]}>
        <mesh position-y={1.6} material={mat.inner} raycast={noRaycast}>
          <boxGeometry args={[12, 3.2, 2.4]} />
        </mesh>
        <mesh position={[0, 3.25, 0]} material={mat.dark} raycast={noRaycast}>
          <boxGeometry args={[12.4, 0.15, 2.8]} />
        </mesh>
        <mesh position={[0, 5, 0.6]} material={fx.GLASS} raycast={noRaycast}>
          <boxGeometry args={[12, 3.4, 0.1]} />
        </mesh>
      </group>
      {/* Plastic chairs */}
      {Array.from({ length: 8 }, (_, i) => r.x0 + 6 + i * 3).map((x) => (
        <group key={x} position={[x, 0, r.z1 - 4]}>
          <mesh position-y={1.3} material={mat.orange} raycast={noRaycast}>
            <boxGeometry args={[2, 0.2, 2]} />
          </mesh>
          <mesh position={[0, 2.4, 0.9]} material={mat.orange} raycast={noRaycast}>
            <boxGeometry args={[2, 2, 0.2]} />
          </mesh>
        </group>
      ))}
      <WallSign text="Exit" x={EXIT.x} z={B.z1 - 0.6} turn={Math.PI} color="#1f7a45" />
    </group>
  );
}

function HallSigns() {
  const R = JAIL_ROOMS;
  const mid = (r: { x0: number; x1: number }) => (r.x0 + r.x1) / 2;
  return (
    <group>
      <WallSign text="Gym" x={mid(R.gym)} z={HALL.z1 - 0.6} turn={Math.PI} />
      <WallSign text="Library" x={mid(R.library)} z={HALL.z1 - 0.6} turn={Math.PI} />
      <WallSign text="Laundry" x={mid(R.laundry)} z={HALL.z1 - 0.6} turn={Math.PI} />
      <WallSign text="Guards only" x={mid(R.guards)} z={HALL.z1 - 0.6} turn={Math.PI} color="#7a1f1f" />
      <WallSign text="Lobby" x={EXIT.x} z={HALL.z1 - 0.6} turn={Math.PI} />
      <WallSign text="Yard" x={mid(MESS_HALL)} z={B.z0 + 1.6} />
      <WallSign text="Main hall" x={mid(MESS_HALL)} z={HALL.z0 - 0.6} turn={Math.PI} />
    </group>
  );
}

function WallSign({ text, x, z, turn = 0, color = "#1b1d21" }: { text: string; x: number; z: number; turn?: number; color?: string }) {
  const t = useMemo(() => signTexture(text, { bg: color, fg: "#ffffff", height: 64 }), [text, color]);
  return (
    <mesh position={[x, 8, z]} rotation-y={turn} raycast={noRaycast}>
      <planeGeometry args={[1.1 * t.aspect, 1.1]} />
      <meshBasicMaterial map={t.texture} transparent />
    </mesh>
  );
}

// ---- The yard -------------------------------------------------------------------------------

function Yard() {
  const fence = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.strokeStyle = "rgba(170,176,182,0.95)";
    g.lineWidth = 2.5;
    for (let i = -64; i < 128; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 64, 64);
      g.moveTo(i + 64, 0);
      g.lineTo(i, 64);
      g.stroke();
    }
    const t = canvasTexture(c, [1, 1]);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
  const ground = useMemo(() => concreteTexture(17, [150, 146, 138], [(YARD.x1 - YARD.x0) / 12, (B.z0 - YARD.z0) / 12]), []);
  const courts = [1150, 1250, 1350];
  const courtZ = (YARD.z0 + B.z0) / 2;
  return (
    <group>
      {/* Concrete yard and basketball courts */}
      <mesh rotation-x={-Math.PI / 2} position={[(YARD.x0 + YARD.x1) / 2, 0.06, (YARD.z0 + B.z0) / 2]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[YARD.x1 - YARD.x0, B.z0 - YARD.z0]} />
        <meshStandardMaterial map={ground} roughness={0.95} />
      </mesh>
      {courts.map((x) => (
        <group key={x}>
          <mesh rotation-x={-Math.PI / 2} position={[x, 0.08, courtZ]} receiveShadow raycast={noRaycast}>
            <planeGeometry args={[30, 20]} />
            <meshStandardMaterial color="#7d4a33" roughness={0.9} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s} position={[x + s * 14, 0, courtZ]} rotation-y={s > 0 ? Math.PI : 0}>
              <mesh position-y={4} material={mat.steel} raycast={noRaycast}>
                <cylinderGeometry args={[0.15, 0.15, 8, 8]} />
              </mesh>
              <mesh position={[0.6, 7.4, 0]} raycast={noRaycast}>
                <boxGeometry args={[0.15, 2.4, 3.6]} />
                <meshStandardMaterial color="#e6e6e0" />
              </mesh>
              <mesh position={[1.3, 6.6, 0]} rotation-x={Math.PI / 2} raycast={noRaycast}>
                <torusGeometry args={[0.55, 0.05, 6, 20]} />
                <meshStandardMaterial color="#b84a1c" />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {/* Pull-up bars and benches */}
      {[1430, 1460].map((x) => (
        <group key={x} position={[x, 0, -235]}>
          {[-1.5, 1.5].map((s) => (
            <mesh key={s} position={[s, 2.5, 0]} material={mat.steel} raycast={noRaycast}>
              <cylinderGeometry args={[0.1, 0.1, 5, 6]} />
            </mesh>
          ))}
          <mesh position={[0, 5, 0]} rotation-z={Math.PI / 2} material={mat.steel} raycast={noRaycast}>
            <cylinderGeometry args={[0.07, 0.07, 3.2, 6]} />
          </mesh>
        </group>
      ))}
      {[1420, 1440, 1460, 1480].map((x) => (
        <mesh key={x} position={[x, 0.9, -265]} material={mat.steel} raycast={noRaycast}>
          <boxGeometry args={[5, 0.3, 1.4]} />
        </mesh>
      ))}
      {/* The fence (chain-link) with razor wire on top */}
      {YARD_FENCE.map((f, i) => {
        const len = Math.max(f.hw, f.hd) * 2;
        const alongX = f.hw > f.hd;
        return (
          <group key={i} position={[f.x, 0, f.z]} rotation-y={alongX ? 0 : Math.PI / 2}>
            <mesh position-y={4} raycast={noRaycast}>
              <planeGeometry args={[len, 8]} />
              <meshStandardMaterial map={fence} transparent alphaTest={0.3} side={THREE.DoubleSide} roughness={0.4} metalness={0.6} />
            </mesh>
            <mesh position-y={8.5} rotation-z={Math.PI / 2} raycast={noRaycast}>
              <cylinderGeometry args={[0.6, 0.6, len, 12, 1, true]} />
              <meshStandardMaterial color="#b4b9be" wireframe />
            </mesh>
            {Array.from({ length: Math.floor(len / 8) + 1 }, (_, k) => (
              <mesh key={k} position={[-len / 2 + k * 8, 4.5, 0]} material={mat.steel} raycast={noRaycast}>
                <cylinderGeometry args={[0.12, 0.12, 9, 6]} />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* Watchtowers round the yard */}
      {[
        [YARD.x0, YARD.z0],
        [YARD.x1, YARD.z0],
        [(YARD.x0 + YARD.x1) / 2, YARD.z0],
      ].map(([x, z]) => (
        <group key={x} position={[x, 0, z]}>
          {[
            [-1.6, -1.6],
            [1.6, -1.6],
            [-1.6, 1.6],
            [1.6, 1.6],
          ].map(([a, b]) => (
            <mesh key={`${a}${b}`} position={[a, 7, b]} material={mat.steel} raycast={noRaycast}>
              <boxGeometry args={[0.35, 14, 0.35]} />
            </mesh>
          ))}
          <mesh position-y={15} material={mat.concrete} castShadow raycast={noRaycast}>
            <boxGeometry args={[5.4, 3, 5.4]} />
          </mesh>
          <mesh position-y={17.2} material={mat.dark} raycast={noRaycast}>
            <coneGeometry args={[4.6, 1.8, 4]} />
          </mesh>
          <mesh position-y={15.4} raycast={noRaycast}>
            <boxGeometry args={[5.5, 1.2, 5.5]} />
            <meshStandardMaterial color="#1a1e22" roughness={0.15} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---- The guards and the other inmates -------------------------------------------------------

function GuardModel({ guard }: { guard: Guard }) {
  const g = useRef<THREE.Group>(null);
  const pose = useMemo(newPose, []);
  const last = useRef({ x: guard.x, z: guard.z });
  useFrame((_, delta) => {
    const group = g.current;
    if (!group) return;
    const moved = Math.hypot(guard.x - last.current.x, guard.z - last.current.z);
    last.current = { x: guard.x, z: guard.z };
    group.position.set(guard.x, 0, guard.z);
    group.rotation.y = Math.PI - guard.yaw;
    const speed = delta > 0 ? moved / delta : 0;
    pose.gait = THREE.MathUtils.damp(pose.gait, speed > 0.5 ? 1 : 0, 8, delta);
    pose.phase += speed * delta * 1.25;
    pose.keycard = guard.keycard;
    pose.aim = THREE.MathUtils.damp(pose.aim, guard.alert > 0 ? 1 : 0, 8, delta);
  });
  return (
    <group ref={g}>
      <Humanoid look={GUARD_LOOK} pose={pose} />
    </group>
  );
}

const SKINS = ["#8d5a3b", "#e0ac83", "#c98e62", "#5b3a26", "#f1c7a1", "#a8714a"];
const HAIR: Look["hairStyle"][] = ["buzz", "bald", "short", "buzz", "short", "bald"];

function Inmate({ x, z, yaw, sit, n }: { x: number; z: number; yaw: number; sit: boolean; n: number }) {
  const look = useMemo(() => PRISONER_LOOK({ ...PLAYER_LOOK, skin: SKINS[n % SKINS.length], hair: "#1b1410", hairStyle: HAIR[n % HAIR.length] }), [n]);
  const pose = useMemo(() => ({ ...newPose(), sit: sit ? 1 : 0, keycard: false }), [sit]);
  return (
    <group position={[x, sit ? 0.3 : 0, z]} rotation-y={Math.PI - yaw}>
      <Humanoid look={look} pose={pose} castShadow={false} />
    </group>
  );
}
