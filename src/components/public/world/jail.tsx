"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GUARD_LOOK, Humanoid, newPose } from "./humanoid";
import { jail, type Guard } from "./jail-state";
import { CELL_ROW, CORRIDOR, JAIL_BOX, JAIL_DOORS, JAIL_ROOMS, JAIL_SOLID, YARD, YARD_FENCE, doorOpen, type JailDoor } from "./jail-layout";
import { canvasTexture, noRaycast, signTexture } from "./paint";
import { Instances, type Place } from "./town";
import * as fx from "./buildings";
import { Near } from "./near";
import { Static } from "./static-merge";

/*
 * Draws the jail from jail-layout.ts: concrete walls, ten cells with bunks
 * and barred sliding doors, the corridor, the gym (weights, bench press,
 * treadmill, punching bag), the guard room (CCTV screens, lockers), the lobby,
 * steel security doors with red/green keycard lights, and the fenced yard
 * with razor wire, a basketball court and two watchtowers. Plus the guards.
 */

const H = JAIL_BOX.h;
const mat = {
  concrete: new THREE.MeshStandardMaterial({ color: "#b9b5ad", roughness: 0.95 }),
  inner: new THREE.MeshStandardMaterial({ color: "#d9d4c7", roughness: 0.9 }),
  floor: new THREE.MeshStandardMaterial({ color: "#8f9399", roughness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: "#7d858f", roughness: 0.35, metalness: 0.75 }),
  dark: new THREE.MeshStandardMaterial({ color: "#2a2e33", roughness: 0.5, metalness: 0.4 }),
  orange: new THREE.MeshStandardMaterial({ color: "#ff7a1a", roughness: 0.8 }),
  blue: new THREE.MeshStandardMaterial({ color: "#2f4a7a", roughness: 0.7 }),
  mat: new THREE.MeshStandardMaterial({ color: "#3a3f46", roughness: 0.95 }),
};

export function Jail() {
  return (
    <group>
      <Shell />
      <Facade />
      <Yard />
      {/* Inside: only drawn when you're nearby. */}
      <Near x={(JAIL_BOX.x0 + JAIL_BOX.x1) / 2} z={(JAIL_BOX.z0 + JAIL_BOX.z1) / 2} dist={170}>
        <Cells />
        {JAIL_DOORS.filter((d) => d.kind === "security").map((d) => (
          <SecurityDoor key={d.id} door={d} />
        ))}
        <Gym />
        <GuardRoom />
        <Lobby />
        {jail.guards.map((g, i) => (
          <GuardModel key={i} guard={g} />
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

function Shell() {
  const B = JAIL_BOX;
  const sign = useMemo(() => signTexture("City Jail", { bg: "#2b2f36", fg: "#ffffff", height: 128 }), []);
  const tiles = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#9aa0a6";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#7f858b";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 128, 128);
    return canvasTexture(c, [(B.x1 - B.x0) / 4, (B.z1 - B.z0) / 4]);
  }, [B.x0, B.x1, B.z0, B.z1]);
  return (
    <group>
      <Instances count={JAIL_SOLID.length} place={placeWall} castShadow>
        <boxGeometry />
        <primitive object={mat.concrete} attach="material" />
      </Instances>
      {/* Floor and roof */}
      <mesh rotation-x={-Math.PI / 2} position={[(B.x0 + B.x1) / 2, 0.05, (B.z0 + B.z1) / 2]} raycast={noRaycast}>
        <planeGeometry args={[B.x1 - B.x0, B.z1 - B.z0]} />
        <meshStandardMaterial map={tiles} roughness={0.75} />
      </mesh>
      <mesh position={[(B.x0 + B.x1) / 2, H + 0.3, (B.z0 + B.z1) / 2]} castShadow raycast={noRaycast}>
        <boxGeometry args={[B.x1 - B.x0 + 1, 0.6, B.z1 - B.z0 + 1]} />
        <primitive object={mat.concrete} attach="material" />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[(B.x0 + B.x1) / 2, H - 0.02, (B.z0 + B.z1) / 2]} raycast={noRaycast}>
        <planeGeometry args={[B.x1 - B.x0, B.z1 - B.z0]} />
        <primitive object={mat.inner} attach="material" />
      </mesh>
      {/* Strip lights along the corridor */}
      {[1280, 1330, 1380, 1430].map((x) => (
        <mesh key={x} position={[x, H - 0.15, (CORRIDOR.z0 + CORRIDOR.z1) / 2]} raycast={noRaycast}>
          <boxGeometry args={[6, 0.15, 0.5]} />
          <meshBasicMaterial color="#f4fbff" toneMapped={false} />
        </mesh>
      ))}
      {/* The sign over the front */}
      <mesh position={[1420, H - 1.6, B.z1 + 0.55]} raycast={noRaycast}>
        <planeGeometry args={[14, 14 / sign.aspect]} />
        <meshBasicMaterial map={sign.texture} transparent />
      </mesh>
      {/* Thin barred windows along the front */}
      {[1270, 1300, 1340, 1370].map((x) => (
        <mesh key={x} position={[x, 6.5, B.z1 + 0.52]} raycast={noRaycast}>
          <planeGeometry args={[6, 1.2]} />
          <meshStandardMaterial color="#1f2328" roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// ---- The front: a proper prison entrance ------------------------------------------------------

function Facade() {
  const B = JAIL_BOX;
  const z = B.z1;
  const title = useMemo(() => signTexture("County Correctional Facility", { bg: "transparent", fg: "#e9ecef", height: 128 }), []);
  const band = fx.mat("#6b6f76", 0.85);
  const brick = fx.mat("#8a5a48", 0.9);
  const glass = fx.mat("#2a3a48", 0.1, 0.6);
  const flag = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 1.3) * 0.18;
  });
  return (
    <group>
      <Static>
      {/* Brick banding along the front, and a row of tall slit windows */}
      <fx.Block x0={B.x0} x1={B.x1} y0={0} y1={1.4} z0={z} z1={z + 0.3} m={brick} />
      <fx.Block x0={B.x0} x1={B.x1} y0={H - 1.2} y1={H} z0={z} z1={z + 0.35} m={band} />
      {Array.from({ length: 22 }, (_, i) => B.x0 + 6 + i * 7)
        .filter((x) => Math.abs(x - 1420) > 9)
        .map((x) => (
          <group key={x}>
            <fx.Block x0={x - 0.35} x1={x + 0.35} y0={2.4} y1={7.6} z0={z} z1={z + 0.12} m={glass} />
            {[-0.2, 0, 0.2].map((b) => (
              <fx.Block key={b} x0={x + b - 0.04} x1={x + b + 0.04} y0={2.4} y1={7.6} z0={z + 0.1} z1={z + 0.18} m={band} />
            ))}
          </group>
        ))}
      {/* The name across the top */}
      <mesh position={[1340, H - 2.2, z + 0.4]} raycast={noRaycast}>
        <planeGeometry args={[60, 60 / title.aspect]} />
        <meshBasicMaterial map={title.texture} transparent />
      </mesh>
      {/* The entrance: a concrete portico over the doors, steps, and lamps */}
      <group position={[1420, 0, z]}>
        <fx.Block x0={-8} x1={8} y0={H - 1} y1={H + 0.4} z0={0} z1={7} m={band} />
        {[-7, -3.4, 3.4, 7].map((x) => (
          <fx.Block key={x} x0={x - 0.45} x1={x + 0.45} y0={0} y1={H - 1} z0={6} z1={6.9} m={fx.mat("#c9ced4", 0.7)} />
        ))}
        <fx.Block x0={-8.5} x1={8.5} y0={0} y1={0.3} z0={0} z1={8} m={fx.mat("#b9b6ae", 0.9)} />
        {[-4.6, 4.6].map((x) => (
          <mesh key={x} position={[x, H - 1.4, 3]} raycast={noRaycast}>
            <boxGeometry args={[0.6, 0.3, 0.6]} />
            <meshStandardMaterial color="#ffffff" emissive="#fff4d6" emissiveIntensity={1.5} />
          </mesh>
        ))}
      </group>
      </Static>
      {/* Flagpoles */}
      {[1396, 1444].map((x, i) => (
        <group key={x} position={[x, 0, z + 14]}>
          <fx.Cyl x={0} y={7} z={0} r={0.12} h={14} m={fx.mat("#c9ced4", 0.3, 0.8)} />
          <mesh ref={i ? undefined : flag} position={[1.6, 12.6, 0]} raycast={noRaycast}>
            <planeGeometry args={[3.2, 2]} />
            <meshStandardMaterial color={i ? "#1f3a5f" : "#c8102e"} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      <Static>
      {/* Watchtowers on the front corners */}
      {[B.x0 + 2, B.x1 - 2].map((x) => (
        <group key={x} position={[x, 0, z - 2]}>
          <fx.Block x0={-2} x1={2} y0={0} y1={H + 6} z0={-2} z1={2} m={fx.mat("#9aa0a6", 0.85)} />
          <fx.Block x0={-3} x1={3} y0={H + 6} y1={H + 9} z0={-3} z1={3} m={glass} />
          <fx.Block x0={-3.4} x1={3.4} y0={H + 9} y1={H + 9.6} z0={-3.4} z1={3.4} m={band} />
          <mesh position={[0, H + 10.2, 0]} raycast={noRaycast}>
            <sphereGeometry args={[0.5, 10, 8]} />
            <meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={1.5} />
          </mesh>
        </group>
      ))}
      </Static>
    </group>
  );
}

// ---- The cells ------------------------------------------------------------------------------

/** Bars across the front of each cell (the bit either side of its door). */
const BARS = (() => {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < CELL_ROW.count; i++) {
    const mid = CELL_ROW.x0 + CELL_ROW.w * (i + 0.5);
    for (let x = CELL_ROW.x0 + CELL_ROW.w * i + 0.4; x < CELL_ROW.x0 + CELL_ROW.w * (i + 1) - 0.2; x += 0.45) if (Math.abs(x - mid) > 2.1) out.push({ x, z: CELL_ROW.z1 });
  }
  return out;
})();
const placeBar: Place = (i, o) => {
  const b = BARS[i];
  o.position.set(b.x, 3.5, b.z);
};
/** Beds and toilets: one bunk and one toilet per cell. */
const placeBunk: Place = (i, o) => {
  o.position.set(CELL_ROW.x0 + CELL_ROW.w * i + 2.2, 1.1, CELL_ROW.z0 + 3.4);
  o.scale.set(3, 0.4, 6.4);
};
const placeBunkTop: Place = (i, o) => {
  o.position.set(CELL_ROW.x0 + CELL_ROW.w * i + 2.2, 3.4, CELL_ROW.z0 + 3.4);
  o.scale.set(3, 0.4, 6.4);
};
const placeToilet: Place = (i, o) => {
  o.position.set(CELL_ROW.x0 + CELL_ROW.w * i + 8, 0.7, CELL_ROW.z0 + 1.2);
};

function Cells() {
  // The orange bars-wall above each cell's front (from the top of the door up to the ceiling).
  return (
    <group>
      <Instances count={BARS.length} place={placeBar}>
        <cylinderGeometry args={[0.06, 0.06, 7, 6]} />
        <primitive object={mat.steel} attach="material" />
      </Instances>
      <Instances count={CELL_ROW.count} place={placeBunk} castShadow>
        <boxGeometry />
        <primitive object={mat.steel} attach="material" />
      </Instances>
      <Instances count={CELL_ROW.count} place={placeBunkTop} castShadow>
        <boxGeometry />
        <primitive object={mat.steel} attach="material" />
      </Instances>
      <Instances count={CELL_ROW.count} place={placeToilet}>
        <cylinderGeometry args={[0.6, 0.45, 1.4, 12]} />
        <meshStandardMaterial color="#d8dde2" roughness={0.2} metalness={0.6} />
      </Instances>
      {/* A rail across the top of the cell fronts */}
      <mesh position={[CELL_ROW.x0 + (CELL_ROW.w * CELL_ROW.count) / 2, 7.05, CELL_ROW.z1]} raycast={noRaycast}>
        <boxGeometry args={[CELL_ROW.w * CELL_ROW.count, 0.3, 0.3]} />
        <primitive object={mat.steel} attach="material" />
      </mesh>
      {/* Cell numbers */}
      {Array.from({ length: CELL_ROW.count }, (_, i) => (
        <CellNumber key={i} n={i + 1} x={CELL_ROW.x0 + CELL_ROW.w * (i + 0.5)} />
      ))}
      {JAIL_DOORS.filter((d) => d.kind === "cell").map((d) => (
        <CellDoor key={d.id} door={d} />
      ))}
    </group>
  );
}

function CellNumber({ n, x }: { n: number; x: number }) {
  const t = useMemo(() => signTexture(String(n), { bg: "#ff7a1a", fg: "#1b1d21", height: 64 }), [n]);
  return (
    <mesh position={[x, 8, CELL_ROW.z1 + 0.2]} raycast={noRaycast}>
      <planeGeometry args={[1.2 * t.aspect, 1.2]} />
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

function Gym() {
  const r = JAIL_ROOMS.gym;
  const bag = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (bag.current) bag.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.7) * 0.08;
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(r.x0 + r.x1) / 2, 0.07, (r.z0 + r.z1) / 2 + 4]} material={mat.mat} raycast={noRaycast}>
        <planeGeometry args={[r.x1 - r.x0 - 6, r.z1 - r.z0 - 12]} />
      </mesh>
      {/* Bench presses with barbells */}
      {[1262, 1276].map((x) => (
        <group key={x} position={[x, 0, 6]}>
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
      {/* Dumbbell rack */}
      <group position={[1295, 0, 24]}>
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
      {/* Treadmills */}
      {[1300, 1310].map((x) => (
        <group key={x} position={[x, 0, 4]}>
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
      {/* Punching bag */}
      <group ref={bag} position={[1322, H, 16]}>
        <mesh position-y={-1.5} material={mat.dark} raycast={noRaycast}>
          <cylinderGeometry args={[0.04, 0.04, 3, 6]} />
        </mesh>
        <mesh position-y={-4.3} raycast={noRaycast}>
          <capsuleGeometry args={[0.9, 2.6, 6, 14]} />
          <meshStandardMaterial color="#9b2a22" roughness={0.6} />
        </mesh>
      </group>
      <WallSign text="Gym" x={1290} z={CORRIDOR.z1 + 0.6} />
    </group>
  );
}

function GuardRoom() {
  return (
    <group>
      {/* Desk with CCTV screens */}
      <group position={[1360, 0, 8]}>
        <mesh position-y={1.4} material={mat.dark} raycast={noRaycast}>
          <boxGeometry args={[12, 0.25, 3]} />
        </mesh>
        <mesh position-y={0.7} material={mat.steel} raycast={noRaycast}>
          <boxGeometry args={[11.6, 1.4, 2.6]} />
        </mesh>
        {[-4, -2, 0, 2, 4].map((x, i) => (
          <mesh key={x} position={[x, 2.6, -1]} raycast={noRaycast}>
            <boxGeometry args={[1.8, 1.2, 0.1]} />
            <meshBasicMaterial color={["#2e6b4f", "#2c4f7a", "#3b6b2e", "#2c4f7a", "#2e6b4f"][i]} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* Lockers */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[1333 + i * 2.1, 2.5, 27.6]} material={mat.blue} raycast={noRaycast}>
          <boxGeometry args={[2, 5, 1.4]} />
        </mesh>
      ))}
      <WallSign text="Guards only" x={1360} z={CORRIDOR.z1 + 0.6} />
    </group>
  );
}

function Lobby() {
  return (
    <group>
      <group position={[1430, 0, 14]}>
        <mesh position-y={1.6} material={mat.inner} raycast={noRaycast}>
          <boxGeometry args={[8, 3.2, 2.4]} />
        </mesh>
        <mesh position={[0, 3.25, 0]} material={mat.dark} raycast={noRaycast}>
          <boxGeometry args={[8.4, 0.15, 2.8]} />
        </mesh>
      </group>
      {/* Plastic chairs */}
      {[1396, 1399, 1402].map((x) => (
        <group key={x} position={[x, 0, 24]}>
          <mesh position-y={1.3} material={mat.orange} raycast={noRaycast}>
            <boxGeometry args={[2, 0.2, 2]} />
          </mesh>
          <mesh position={[0, 2.4, 0.9]} material={mat.orange} raycast={noRaycast}>
            <boxGeometry args={[2, 2, 0.2]} />
          </mesh>
        </group>
      ))}
      <WallSign text="Exit" x={1420} z={JAIL_BOX.z1 - 0.6} turn={Math.PI} color="#1f9d55" />
      <WallSign text="Lobby" x={1420} z={CORRIDOR.z1 + 0.6} />
      <WallSign text="Yard" x={1400} z={JAIL_BOX.z0 + 0.6} />
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
    g.strokeStyle = "rgba(190,196,204,0.95)";
    g.lineWidth = 3;
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
  const hoopZ = (YARD.z0 + JAIL_BOX.z0) / 2;
  return (
    <group>
      {/* Concrete yard and a basketball court */}
      <mesh rotation-x={-Math.PI / 2} position={[(YARD.x0 + YARD.x1) / 2, 0.06, (YARD.z0 + JAIL_BOX.z0) / 2]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[YARD.x1 - YARD.x0, JAIL_BOX.z0 - YARD.z0]} />
        <meshStandardMaterial color="#a7a49d" roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[1300, 0.08, hoopZ]} raycast={noRaycast}>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial color="#b0603a" roughness={0.9} />
      </mesh>
      <group position={[1286, 0, hoopZ]}>
        <mesh position-y={4} material={mat.steel} raycast={noRaycast}>
          <cylinderGeometry args={[0.15, 0.15, 8, 8]} />
        </mesh>
        <mesh position={[0.6, 7.4, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.15, 2.4, 3.6]} />
          <meshStandardMaterial color="#f4f4f0" />
        </mesh>
        <mesh position={[1.3, 6.6, 0]} rotation-x={Math.PI / 2} raycast={noRaycast}>
          <torusGeometry args={[0.55, 0.05, 6, 20]} />
          <meshStandardMaterial color="#ff5a1f" />
        </mesh>
      </group>
      {/* Pull-up bars and benches */}
      <group position={[1360, 0, -70]}>
        {[-1.5, 1.5].map((s) => (
          <mesh key={s} position={[s, 2.5, 0]} material={mat.steel} raycast={noRaycast}>
            <cylinderGeometry args={[0.1, 0.1, 5, 6]} />
          </mesh>
        ))}
        <mesh position={[0, 5, 0]} rotation-z={Math.PI / 2} material={mat.steel} raycast={noRaycast}>
          <cylinderGeometry args={[0.07, 0.07, 3.2, 6]} />
        </mesh>
      </group>
      {[1390, 1405].map((x) => (
        <mesh key={x} position={[x, 0.9, -84]} material={mat.steel} raycast={noRaycast}>
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
              <meshStandardMaterial color="#c9ced4" wireframe />
            </mesh>
            {Array.from({ length: Math.floor(len / 8) + 1 }, (_, k) => (
              <mesh key={k} position={[-len / 2 + k * 8, 4.5, 0]} material={mat.steel} raycast={noRaycast}>
                <cylinderGeometry args={[0.12, 0.12, 9, 6]} />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* Watchtowers at the far corners */}
      {[YARD.x0, YARD.x1].map((x) => (
        <group key={x} position={[x, 0, YARD.z0]}>
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
            <meshStandardMaterial color="#1f2328" roughness={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---- The guards ------------------------------------------------------------------------------

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
