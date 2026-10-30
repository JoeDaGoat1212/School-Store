"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { player } from "./bump";
import { drive } from "./drive";
import { Block, Cyl, mat } from "./buildings";
import { surface } from "./detail";
import { Near } from "./near";
import { canvasTexture, fontFamily, noRaycast, seededRandom } from "./paint";
import { puff } from "./smoke";
import { Static } from "./static-merge";
import { BASE_DOME, BASE_DOOR, baseDoor, groundAt } from "./terrain";
import { BASE, BASE_HELIPAD, BASE_VALLEY } from "./world-map";

/*
 * The secret base: a whole hollow mountain. Outside, a rock dome with radar
 * and dishes on top, a rock door that slides open when you drive up (after a
 * green scanner sweeps you), and a helipad out in the valley with its own
 * helicopter (fleet.ts). Inside, a hangar 92 wide, 120 deep and 30 high:
 *
 *   - a polished floor with painted bays and guide lines, concrete walls
 *     between steel ribs, roof trusses with hanging lights,
 *   - the workshop (car lift, tool wall, tyre racks, workbench) and six
 *     marked parking bays down the left,
 *   - a turntable in the middle that slowly spins under spotlights,
 *   - the drop zone (where the loot goes) ringed by pallets of cash and
 *     stacks of gold bars,
 *   - the lounge down the right: sofas round a big screen, a bar with a
 *     neon sign, a pool table and arcade cabinets,
 *   - the command deck across the back: a raised floor up two flights of
 *     stairs, a wall of screens with the city map, consoles, and a glowing
 *     map table.
 */

const W = BASE.halfW;
const D = BASE.depth;
const H = BASE.height;
const ROUND = new THREE.SphereGeometry(1, 14, 10);

function useCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!);
    return canvasTexture(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function SecretBase() {
  return (
    <group>
      <Mountain />
      <Near x={BASE.x} z={BASE.doorZ - D / 2} dist={260}>
        <Hangar />
      </Near>
      <Near x={BASE_HELIPAD.x} z={BASE_HELIPAD.z} dist={600}>
        <Helipad />
      </Near>
    </group>
  );
}

// ---- The mountain and its door --------------------------------------------------------------------

const RY = H + 74;

function Mountain() {
  const floorY = BASE_VALLEY.y;
  const { dome, top } = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 6);
    const p = g.attributes.position;
    const rand = seededRandom(5);
    const bumps = Array.from({ length: 40 }, () => new THREE.Vector3(rand() * 2 - 1, rand() * 1.2, rand() * 2 - 1).normalize());
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    let top = 0;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      n.copy(v);
      if (v.y < 0) v.y *= 0.12;
      let k = 1;
      for (const b of bumps) k += Math.max(0, n.dot(b) - 0.88) * 1.4;
      // Craggy: small noise on top of the big lumps.
      k += (Math.sin(n.x * 23 + n.z * 17) * Math.cos(n.y * 19 - n.x * 7)) * 0.025;
      v.set(v.x * BASE_DOME.rx * k, v.y * RY * k, v.z * BASE_DOME.rz * k);
      p.setXYZ(i, v.x, v.y, v.z);
      if (Math.abs(n.x) < 0.16 && Math.abs(n.z) < 0.16 && n.y > 0) top = Math.max(top, v.y);
    }
    // Cut the doorway out of the front.
    const keep: number[] = [];
    const c = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(p, i + k));
      c.multiplyScalar(1 / 3);
      const hole = Math.abs(c.x) < BASE_DOOR.halfW + 3 && c.y < BASE_DOOR.height + 4 && c.z > BASE_DOME.rz * 0.4;
      if (!hole) keep.push(i, i + 1, i + 2);
    }
    const arr = new Float32Array(keep.length * 3);
    const col = new Float32Array(keep.length * 3);
    const rock = new THREE.Color("#7a746b");
    const dark = new THREE.Color("#58534c");
    const moss = new THREE.Color("#5d6b3e");
    const snow = new THREE.Color("#e9edf0");
    const cc = new THREE.Color();
    keep.forEach((idx, m) => {
      const x = p.getX(idx);
      const y = p.getY(idx);
      const z = p.getZ(idx);
      arr[m * 3] = x;
      arr[m * 3 + 1] = y;
      arr[m * 3 + 2] = z;
      const tri = Math.floor(m / 3);
      const h = Math.sin(tri * 12.9898) * 43758.5453;
      const r = h - Math.floor(h);
      cc.copy(rock).lerp(dark, r * 0.6);
      if (y < 14) cc.lerp(moss, 0.55 * (1 - y / 14));
      if (y > RY * 0.8) cc.lerp(snow, Math.min(1, (y - RY * 0.8) / (RY * 0.15)));
      col[m * 3] = cc.r;
      col[m * 3 + 1] = cc.g;
      col[m * 3 + 2] = cc.b;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    out.computeVertexNormals();
    g.dispose();
    return { dome: out, top };
  }, []);
  useEffect(() => () => dome.dispose(), [dome]);

  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const scan = useRef<THREE.Mesh>(null);
  const radar = useRef<THREE.Group>(null);
  const beacons = useRef<THREE.Group>(null);
  const state = useRef({ near: false, since: 0, dustDue: 0 });

  useFrame((frame, delta) => {
    const t = frame.clock.elapsedTime;
    const x = drive.active ? drive.pos.x : player.x;
    const z = drive.active ? drive.pos.z : player.z;
    const d = Math.hypot(x - BASE.x, z - BASE.doorZ);
    const s = state.current;
    const near = d < 60;
    if (near !== s.near) {
      s.near = near;
      s.since = t;
    }
    // Scanner sweeps for a second, then the rock rumbles open.
    const want = near && t - s.since > 1.1 ? 1 : near ? baseDoor.open : 0;
    const before = baseDoor.open;
    baseDoor.open = THREE.MathUtils.damp(baseDoor.open, want, 1.4, delta);
    const moving = Math.abs(baseDoor.open - before) > 0.0015;
    if (moving) {
      s.dustDue += delta * 18;
      while (s.dustDue >= 1) {
        s.dustDue -= 1;
        puff(BASE.x + (Math.random() - 0.5) * BASE_DOOR.halfW * 2, floorY + Math.random() * 3, BASE.doorZ + 2);
      }
    }
    const slide = baseDoor.open * (BASE_DOOR.halfW + 1);
    if (left.current) left.current.position.x = -BASE_DOOR.halfW / 2 - slide;
    if (right.current) right.current.position.x = BASE_DOOR.halfW / 2 + slide;
    if (scan.current) {
      scan.current.visible = near && t - s.since < 1.6;
      scan.current.position.y = 1 + ((t - s.since) % 0.8) * 20;
    }
    if (radar.current) radar.current.rotation.y = t * 0.8;
    if (beacons.current) beacons.current.children.forEach((b, i) => (b.visible = Math.sin(t * 5 + i * Math.PI) > 0));
  });

  const rockFlat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6f695f", roughness: 1, flatShading: true }), []);
  const steel = mat("#7d848c", 0.35, 0.8);
  const white = mat("#e8eaec", 0.4, 0.3);
  const red = mat("#ff3b2f", 0.3, 0, "#ff2a1a");
  return (
    <group>
      <mesh geometry={dome} position={[BASE.x, floorY - 2, BASE_DOME.z]} castShadow receiveShadow raycast={noRaycast}>
        <meshStandardMaterial vertexColors roughness={0.97} flatShading />
      </mesh>
      {/* On top: a spinning radar, dishes and an aerial mast with a blinking light */}
      <group position={[BASE.x, floorY - 2 + top - 1, BASE_DOME.z]}>
        <Cyl x={0} y={1.5} z={0} r={3.5} h={3} m={mat("#5c6168", 0.6, 0.4)} />
        <group ref={radar} position-y={4}>
          <Cyl x={0} y={1} z={0} r={0.4} h={2} m={steel} />
          <Block x0={-5} x1={5} y0={2} y1={3.2} z0={-0.15} z1={0.15} m={white} />
          <Block x0={-5} x1={5} y0={2.2} y1={3} z0={0.15} z1={0.6} m={steel} />
        </group>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 9, -1.5, 4]} rotation-x={-0.6} rotation-y={s * 0.6}>
            <mesh material={white} raycast={noRaycast} position-y={2}>
              <sphereGeometry args={[2.6, 20, 10, 0, Math.PI * 2, 0, 1.1]} />
            </mesh>
            <Cyl x={0} y={1} z={0} r={0.2} h={2} m={steel} />
          </group>
        ))}
        <Cyl x={-6} y={10} z={-6} r={0.25} h={20} m={steel} />
        <group ref={beacons}>
          <mesh geometry={ROUND} material={red} position={[-6, 20.4, -6]} scale={0.5} raycast={noRaycast} />
        </group>
      </group>
      {/* The rocky arch round the entrance */}
      <group position={[BASE.x, floorY, BASE.doorZ + 1]}>
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[s * (BASE_DOOR.halfW + 4), BASE_DOOR.height / 2, 0]} scale={[1, 1.8, 1]} material={rockFlat} castShadow raycast={noRaycast}>
              <dodecahedronGeometry args={[7, 1]} />
            </mesh>
            <mesh position={[s * (BASE_DOOR.halfW + 10), 3, 3]} scale={[1.3, 0.8, 1]} material={rockFlat} castShadow raycast={noRaycast}>
              <dodecahedronGeometry args={[5, 1]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, BASE_DOOR.height + 4.5, 0]} scale={[3.4, 0.9, 1.2]} material={rockFlat} castShadow raycast={noRaycast}>
          <dodecahedronGeometry args={[7, 1]} />
        </mesh>
        {/* The door: two slabs of fake rock that slide into the mountain */}
        {[left, right].map((ref, k) => (
          <group key={k} ref={ref} position-x={(k ? 1 : -1) * (BASE_DOOR.halfW / 2)}>
            <mesh position={[0, BASE_DOOR.height / 2, -0.6]} castShadow raycast={noRaycast}>
              <boxGeometry args={[BASE_DOOR.halfW, BASE_DOOR.height, 1.6]} />
              <meshStandardMaterial color="#77716a" roughness={1} />
            </mesh>
            {Array.from({ length: 8 }, (_, j) => (
              <mesh key={j} position={[((j * 37) % 7) - 3, 2 + j * 2.3, 0.5]} scale={[1.8, 1.3, 0.6]} material={rockFlat} raycast={noRaycast}>
                <dodecahedronGeometry args={[1.5, 0]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* The scanner: a thin green sheet of light that sweeps up and down */}
        <mesh ref={scan} position={[0, 2, 8]} rotation-x={-Math.PI / 2} visible={false} raycast={noRaycast}>
          <planeGeometry args={[BASE_DOOR.halfW * 2, 14]} />
          <meshBasicMaterial color="#38ff7a" transparent opacity={0.35} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        {/* Hidden floor lights leading in */}
        {Array.from({ length: 8 }, (_, i) => (
          <group key={i}>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * (BASE_DOOR.halfW - 2), 0.08, 6 + i * 4]} raycast={noRaycast}>
                <boxGeometry args={[0.5, 0.1, 1.4]} />
                <meshBasicMaterial color="#7fd8ff" toneMapped={false} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}

// ---- Inside ------------------------------------------------------------------------------------------

function Hangar() {
  const floorY = BASE_VALLEY.y;
  const floorTex = useCanvas(1024, 1024, (g) => {
    g.fillStyle = "#2a2e33";
    g.fillRect(0, 0, 1024, 1024);
    const r = seededRandom(3);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.05)";
      g.fillRect(r() * 1024, r() * 1024, 3, 3);
    }
    // Panel joints.
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 2;
    for (let i = 0; i <= 1024; i += 128) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 1024);
      g.moveTo(0, i);
      g.lineTo(1024, i);
      g.stroke();
    }
  });
  const floorM = useMemo(() => {
    const t = floorTex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set((W * 2) / 16, D / 16);
    t.needsUpdate = true;
    const m = new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.22, metalness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.15 });
    m.userData.keepLook = true;
    return m;
  }, [floorTex]);
  const wall = surface("concrete", "#5a6068", 0.85);
  const rib = mat("#2b3036", 0.4, 0.7);
  const ceiling = mat("#1f2328", 0.9);
  const lamp = mat("#e9f6ff", 0.3, 0, "#d9f2ff");
  const yellow = mat("#f2c12e", 0.6);
  const white = mat("#e8eaec", 0.6);
  const lights = useRef<THREE.Group>(null);
  useFrame(() => {
    const k = 0.25 + baseDoor.open * 0.75;
    lights.current?.children.forEach((c) => {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m && m.emissiveIntensity !== undefined) m.emissiveIntensity = k;
    });
  });
  return (
    <group position={[BASE.x, floorY, BASE.doorZ]}>
      {/* Floor, with painted lines: the drive in, the parking bays, the hazard stripes */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, -D / 2]} material={floorM} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[W * 2, D + 2]} />
      </mesh>
      <Static>
        {[-9, 9].map((x) => (
          <Block key={x} x0={x - 0.2} x1={x + 0.2} y0={0.05} y1={0.07} z0={-D + 18} z1={-2} m={yellow} />
        ))}
        {Array.from({ length: 7 }, (_, i) => -14 - i * 10).map((z) => (
          <Block key={`bay${z}`} x0={-38} x1={-22} y0={0.05} y1={0.07} z0={z - 0.12} z1={z + 0.12} m={white} />
        ))}
        {/* Walls: concrete between steel ribs */}
        <Block x0={-W - 0.6} x1={-W} y0={0} y1={H} z0={-D} z1={0} m={wall} />
        <Block x0={W} x1={W + 0.6} y0={0} y1={H} z0={-D} z1={0} m={wall} />
        <Block x0={-W} x1={W} y0={0} y1={H} z0={-D - 0.6} z1={-D} m={wall} />
        <Block x0={-W} x1={W} y0={H} y1={H + 0.6} z0={-D} z1={0} m={ceiling} />
        {[-1, 1].map((s) => (
          <Block key={`fw${s}`} x0={s < 0 ? -W : BASE_DOOR.halfW} x1={s < 0 ? -BASE_DOOR.halfW : W} y0={0} y1={H} z0={-1.6} z1={-1} m={wall} />
        ))}
        <Block x0={-BASE_DOOR.halfW} x1={BASE_DOOR.halfW} y0={BASE_DOOR.height} y1={H} z0={-1.6} z1={-1} m={wall} />
        {Array.from({ length: 13 }, (_, i) => -4 - i * 9.5).map((z) => (
          <group key={`rib${z}`}>
            <Block x0={-W} x1={-W + 0.8} y0={0} y1={H} z0={z - 0.4} z1={z + 0.4} m={rib} />
            <Block x0={W - 0.8} x1={W} y0={0} y1={H} z0={z - 0.4} z1={z + 0.4} m={rib} />
            {/* A roof truss across */}
            <Block x0={-W} x1={W} y0={H - 1.6} y1={H - 1.2} z0={z - 0.3} z1={z + 0.3} m={rib} />
            <Block x0={-W} x1={W} y0={H - 0.4} y1={H} z0={z - 0.3} z1={z + 0.3} m={rib} />
            {Array.from({ length: 12 }, (_, k) => -W + 4 + k * 7.7).map((x) => (
              <mesh key={x} position={[x, H - 0.8, z]} rotation-z={k(x) ? 0.8 : -0.8} material={rib} raycast={noRaycast}>
                <boxGeometry args={[0.2, 1.7, 0.2]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Hazard stripes round the doorway */}
        {Array.from({ length: 16 }, (_, i) => -BASE_DOOR.halfW + i * 2).map((x, i) => (
          <Block key={`hz${x}`} x0={x} x1={x + 2} y0={0.05} y1={0.07} z0={-4} z1={-2.4} m={i % 2 ? mat("#1b1d21", 0.8) : yellow} />
        ))}
      </Static>
      {/* Hanging lights (they brighten as the door opens) */}
      <group ref={lights}>
        {Array.from({ length: 12 }, (_, i) => -8 - i * 9.5).flatMap((z) =>
          [-30, -10, 10, 30].map((x) => (
            <mesh key={`${x}${z}`} position={[x, H - 3.5, z]} material={lamp} raycast={noRaycast}>
              <boxGeometry args={[4, 0.3, 1]} />
            </mesh>
          )),
        )}
      </group>
      <Workshop />
      <Turntable />
      <Vault />
      <Lounge />
      <CommandDeck />
      <Crates />
    </group>
  );
}
const k = (x: number) => Math.round(x) % 2 === 0;

function Workshop() {
  const steel = mat("#8a9098", 0.35, 0.8);
  const red = mat("#c8272d", 0.4, 0.3);
  const dark = mat("#22262b", 0.6, 0.3);
  const peg = mat("#3a4048", 0.8);
  const tyre = mat("#1a1a1a", 0.9);
  return (
    <Static>
      {/* The car lift: two posts and arms */}
      <group position={[-30, 0, -84]}>
        {[-3.4, 3.4].map((x) => (
          <group key={x}>
            <Block x0={x - 0.4} x1={x + 0.4} y0={0} y1={4.8} z0={-0.4} z1={0.4} m={red} cast />
            <Block x0={x - 0.2} x1={x + 0.2} y0={1.6} y1={1.8} z0={-2.2} z1={2.2} m={steel} />
          </group>
        ))}
        <Block x0={-3.4} x1={3.4} y0={4.6} y1={4.9} z0={-0.3} z1={0.3} m={red} />
      </group>
      {/* The tool wall and the workbench */}
      <Block x0={-W + 0.05} x1={-W + 0.2} y0={1} y1={5.5} z0={-30} z1={-14} m={peg} />
      {Array.from({ length: 30 }, (_, i) => i).map((i) => (
        <Block key={i} x0={-W + 0.2} x1={-W + 0.35} y0={2 + (i % 5) * 0.75} y1={2.4 + (i % 5) * 0.75 + (i % 3) * 0.12} z0={-29.5 + Math.floor(i / 5) * 2.6} z1={-29.3 + Math.floor(i / 5) * 2.6 + (i % 2) * 0.3} m={i % 4 ? steel : red} />
      ))}
      <Block x0={-W + 1} x1={-W + 4} y0={0} y1={1.1} z0={-30} z1={-14} m={dark} cast />
      <Block x0={-W + 0.9} x1={-W + 4.1} y0={1.1} y1={1.2} z0={-30.1} z1={-13.9} m={steel} />
      {/* Toolbox chests */}
      {[-17, -21].map((z) => (
        <group key={z}>
          <Block x0={-W + 4.6} x1={-W + 6.2} y0={0} y1={1.6} z0={z - 1} z1={z + 1} m={red} />
          {[0.4, 0.8, 1.2].map((y) => (
            <Block key={y} x0={-W + 6.2} x1={-W + 6.25} y0={y - 0.02} y1={y + 0.02} z0={z - 0.8} z1={z + 0.8} m={steel} />
          ))}
        </group>
      ))}
      {/* A rack of tyres */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={`t${i}`} position={[-W + 1.6, 0.6 + (i % 4) * 1.15, -40 - Math.floor(i / 4) * 1.2]} rotation-z={Math.PI / 2} material={tyre} raycast={noRaycast}>
          <torusGeometry args={[0.45, 0.22, 8, 16]} />
        </mesh>
      ))}
    </Static>
  );
}

function Turntable() {
  const plate = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (plate.current) plate.current.rotation.y += dt * 0.25;
  });
  const steel = mat("#9aa1a9", 0.25, 0.9);
  const ring = mat("#69d2ff", 0.3, 0, "#3fbfff");
  const z = -36;
  return (
    <group position={[0, 0, z]}>
      <group ref={plate}>
        <Cyl x={0} y={0.12} z={0} r={8} h={0.24} m={steel} />
        {Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI).map((a) => (
          <mesh key={a} position-y={0.25} rotation-y={a} raycast={noRaycast}>
            <boxGeometry args={[15.6, 0.02, 0.08]} />
            <meshStandardMaterial color="#5d646c" roughness={0.4} metalness={0.8} />
          </mesh>
        ))}
      </group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.08} material={ring} raycast={noRaycast}>
        <ringGeometry args={[8.1, 8.5, 64]} />
      </mesh>
      {/* Spotlights from above (soft beams) */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 3, H / 2 - 2, Math.sin(a) * 3]} rotation-z={Math.cos(a) * 0.12} rotation-x={-Math.sin(a) * 0.12} raycast={noRaycast}>
            <coneGeometry args={[5, H - 6, 24, 1, true]} />
            <meshBasicMaterial color="#cfeeff" transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function Vault() {
  const z = -D * 0.62;
  const sign = useCanvas(512, 128, (g) => {
    g.fillStyle = "rgba(0,0,0,0)";
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = "#ffcc00";
    g.font = `800 84px ${fontFamily("display")}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("DROP LOOT", 256, 66);
  });
  const pad = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (pad.current) (pad.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(s.clock.elapsedTime * 3) * 0.2;
  });
  // Gold bars in stepped stacks, and cash on pallets.
  const gold = useMemo(() => {
    const out: { x: number; y: number; z: number }[] = [];
    for (const [cx, cz] of [
      [-14.5, z],
      [14.5, z],
    ])
      for (let l = 0; l < 5; l++)
        for (let i = 0; i < 6 - l; i++)
          for (let j = 0; j < 4 - Math.floor(l / 2); j++) out.push({ x: cx + (j - (3 - Math.floor(l / 2)) / 2) * 1.0, y: 0.2 + l * 0.42, z: cz + (i - (5 - l) / 2) * 0.55 });
    return out;
  }, [z]);
  const bars = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = bars.current;
    if (!m) return;
    const o = new THREE.Object3D();
    gold.forEach((g, i) => {
      o.position.set(g.x, g.y, g.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [gold]);
  const cash = mat("#4f7d4a", 0.8);
  const band = mat("#e9e2c8", 0.7);
  const pallet = surface("planks", "#a98458", 0.9);
  return (
    <group>
      <mesh ref={pad} rotation-x={-Math.PI / 2} position={[0, 0.07, z]} raycast={noRaycast}>
        <ringGeometry args={[5.4, 7, 64]} />
        <meshBasicMaterial color="#ffcc00" transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, z]} raycast={noRaycast}>
        <circleGeometry args={[5.4, 64]} />
        <meshBasicMaterial color="#3a2f12" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.09, z + 9]} raycast={noRaycast}>
        <planeGeometry args={[10, 2.5]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} />
      </mesh>
      <instancedMesh ref={bars} args={[undefined, undefined, gold.length]} castShadow raycast={noRaycast}>
        <boxGeometry args={[0.9, 0.38, 0.48]} />
        <meshStandardMaterial color="#e2b23c" roughness={0.22} metalness={1} />
      </instancedMesh>
      <Static>
        {[
          [0, z - 14.5],
          [-5, z - 14.5],
          [5, z - 14.5],
        ].map(([x, zz]) => (
          <group key={x} position={[x, 0, zz]}>
            <Block x0={-1.5} x1={1.5} y0={0} y1={0.3} z0={-1.5} z1={1.5} m={pallet} />
            {Array.from({ length: 4 }, (_, l) => (
              <group key={l}>
                <Block x0={-1.4} x1={1.4} y0={0.3 + l * 0.5} y1={0.78 + l * 0.5} z0={-1.4} z1={1.4} m={cash} />
                <Block x0={-0.15} x1={0.15} y0={0.3 + l * 0.5} y1={0.79 + l * 0.5} z0={-1.42} z1={1.42} m={band} />
              </group>
            ))}
          </group>
        ))}
      </Static>
    </group>
  );
}

function Lounge() {
  const sofa = mat("#3a2a24", 0.7);
  const cushion = mat("#5b4236", 0.8);
  const rug = mat("#5a1f2b", 0.95);
  const bar = surface("planks", "#3b2a20", 0.6);
  const top = mat("#d9d4cc", 0.2, 0.1);
  const felt = mat("#1f6b3a", 0.9);
  const wood = surface("planks", "#6b4a32", 0.7);
  const chrome = mat("#c9cfd5", 0.15, 1);
  const neon = useCanvas(512, 160, (g) => {
    g.clearRect(0, 0, 512, 160);
    g.shadowColor = "#ff3fd4";
    g.shadowBlur = 24;
    g.strokeStyle = "#ff7be4";
    g.lineWidth = 8;
    g.font = `800 96px ${fontFamily("display")}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.strokeText("THE NEST", 256, 84);
    g.fillStyle = "#ffe3fa";
    g.fillText("THE NEST", 256, 84);
  });
  const screen = useCanvas(512, 288, (g) => {
    const grad = g.createLinearGradient(0, 0, 512, 288);
    grad.addColorStop(0, "#0d2a4a");
    grad.addColorStop(1, "#3a0d4a");
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 288);
    g.fillStyle = "#ffffff";
    g.font = `800 40px ${fontFamily("display")}`;
    g.textAlign = "center";
    g.fillText("BREAKING: BANK ROBBED", 256, 130);
    g.font = `500 24px ${fontFamily("body")}`;
    g.fillText("Police are searching the city…", 256, 175);
  });
  const x0 = 26;
  return (
    <group>
      <Static>
        <Block x0={x0} x1={W - 1} y0={0.05} y1={0.08} z0={-32} z1={-14} m={rug} />
        {/* Sofas round the screen */}
        {[
          [x0 + 2, -23, Math.PI / 2],
          [x0 + 9, -31, 0],
          [x0 + 9, -15, Math.PI],
        ].map(([x, z, turn]) => (
          <group key={`${x}${z}`} position={[x, 0, z]} rotation-y={turn}>
            <Block x0={-4} x1={4} y0={0} y1={0.9} z0={-1} z1={1} m={sofa} cast />
            <Block x0={-4} x1={4} y0={0.9} y1={2} z0={-1} z1={-0.4} m={sofa} />
            <Block x0={-3.9} x1={3.9} y0={0.9} y1={1.15} z0={-0.4} z1={0.95} m={cushion} />
            {[-1, 1].map((s) => (
              <Block key={s} x0={s * 4 - 0.4} x1={s * 4 + 0.4} y0={0} y1={1.4} z0={-1} z1={1} m={sofa} />
            ))}
          </group>
        ))}
        <Block x0={x0 + 6} x1={x0 + 12} y0={0} y1={0.6} z0={-25} z1={-21} m={top} />
        {/* The bar */}
        <Block x0={30} x1={44} y0={0} y1={1.3} z0={-58} z1={-55} m={bar} cast />
        <Block x0={29.8} x1={44.2} y0={1.3} y1={1.42} z0={-58.2} z1={-54.8} m={top} />
        <Block x0={34} x1={W - 0.5} y0={1.5} y1={1.6} z0={-61.5} z1={-60.5} m={top} />
        <Block x0={34} x1={W - 0.5} y0={2.6} y1={2.7} z0={-61.5} z1={-60.5} m={top} />
        {Array.from({ length: 16 }, (_, i) => (
          <Cyl key={`bt${i}`} x={34.5 + i * 0.7} y={1.6 + 0.3 + (i % 2) * 1.1} z={-61} r={0.12} h={0.6} m={mat(["#2f6b3a", "#8a4b1f", "#d9d4cc", "#5a1f2b"][i % 4], 0.1, 0.2)} />
        ))}
        {Array.from({ length: 6 }, (_, i) => 31.5 + i * 2.2).map((x) => (
          <group key={`st${x}`}>
            <Cyl x={x} y={0.5} z={-53.6} r={0.08} h={1} m={chrome} />
            <Cyl x={x} y={1.05} z={-53.6} r={0.45} h={0.12} m={sofa} />
          </group>
        ))}
        {/* The pool table */}
        <group position={[33, 0, -38.25]}>
          <Block x0={-3} x1={3} y0={0.8} y1={1.05} z0={-1.75} z1={1.75} m={wood} cast />
          <Block x0={-2.7} x1={2.7} y0={1.05} y1={1.1} z0={-1.45} z1={1.45} m={felt} />
          {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Block key={`${sx}${sz}`} x0={sx * 2.6 - 0.25} x1={sx * 2.6 + 0.25} y0={0} y1={0.8} z0={sz * 1.4 - 0.25} z1={sz * 1.4 + 0.25} m={wood} />))}
        </group>
        {/* Arcade cabinets */}
        {[-44, -46.4, -48.8].map((z) => (
          <group key={`ar${z}`} position={[W - 1.4, 0, z]}>
            <Block x0={-0.9} x1={0.9} y0={0} y1={3} z0={-1} z1={1} m={mat("#1b1d21", 0.5)} />
          </group>
        ))}
      </Static>
      {/* Glowing bits: the big screen, the neon sign, the arcade screens */}
      <mesh position={[W - 0.3, 5, -23]} rotation-y={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[12, 6.75]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
      <mesh position={[37, 5.2, -61.9]} raycast={noRaycast}>
        <planeGeometry args={[9, 2.8]} />
        <meshBasicMaterial map={neon} transparent toneMapped={false} />
      </mesh>
      {[-44, -46.4, -48.8].map((z, i) => (
        <mesh key={z} position={[W - 2.31, 2.1, z]} rotation-y={-Math.PI / 2} raycast={noRaycast}>
          <planeGeometry args={[1.4, 1.1]} />
          <meshBasicMaterial color={["#29d17a", "#ff5a1f", "#2a8cff"][i]} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function CommandDeck() {
  const deckY = 7;
  const z0 = -D;
  const z1 = -D + 15;
  const steel = mat("#3a4048", 0.4, 0.7);
  const glass = mat("#8fb8cc", 0.05, 0.3);
  const desk = mat("#1f2328", 0.5, 0.4);
  const wall = useCanvas(1600, 640, (g) => {
    g.fillStyle = "#061722";
    g.fillRect(0, 0, 1600, 640);
    g.strokeStyle = "rgba(60,180,255,0.18)";
    g.lineWidth = 1;
    for (let x = 0; x < 1600; x += 40) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 640);
      g.stroke();
    }
    for (let y = 0; y < 640; y += 40) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(1600, y);
      g.stroke();
    }
    // A stylised city map: blocks, the river of roads, the target circled.
    const r = seededRandom(8);
    g.fillStyle = "rgba(80,200,255,0.55)";
    for (let i = 0; i < 160; i++) g.fillRect(300 + Math.floor(r() * 26) * 38, 120 + Math.floor(r() * 11) * 38, 28 + r() * 8, 28 + r() * 8);
    g.strokeStyle = "#ff4d3a";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(980, 330, 60, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#ff4d3a";
    g.font = `700 34px ${fontFamily("body")}`;
    g.fillText("TARGET: CITY BANK", 1060, 280);
    g.fillStyle = "#7fe3ff";
    g.font = `800 60px ${fontFamily("display")}`;
    g.fillText("OPERATIONS", 40, 80);
    g.font = `500 26px ${fontFamily("body")}`;
    ["ROUTE: MOUNTAIN ROAD", "HELI: READY", "VAULT: ARMED", "HEAT: LOW"].forEach((t, i) => g.fillText(t, 40, 160 + i * 44));
  });
  const holo = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (holo.current) holo.current.rotation.y = s.clock.elapsedTime * 0.3;
  });
  return (
    <group>
      <Static>
        {/* The raised deck, on columns */}
        <Block x0={-34} x1={34} y0={deckY - 0.5} y1={deckY} z0={z0} z1={z1} m={steel} cast />
        <Block x0={-34} x1={34} y0={0} y1={deckY - 0.5} z0={z0} z1={z1 - 3} m={mat("#2b3036", 0.8)} />
        {[-30, -15, 0, 15, 30].map((x) => (
          <Block key={x} x0={x - 0.4} x1={x + 0.4} y0={0} y1={deckY} z0={z1 - 0.8} z1={z1} m={steel} />
        ))}
        {/* Glass rail along the front */}
        <Block x0={-34} x1={-6} y0={deckY} y1={deckY + 1.2} z0={z1 - 0.1} z1={z1} m={glass} />
        <Block x0={6} x1={34} y0={deckY} y1={deckY + 1.2} z0={z1 - 0.1} z1={z1} m={glass} />
        <Block x0={-34} x1={34} y0={deckY + 1.2} y1={deckY + 1.3} z0={z1 - 0.15} z1={z1 + 0.05} m={steel} />
        {/* Stairs up each end */}
        {[-1, 1].map((s) =>
          Array.from({ length: 14 }, (_, i) => (
            <Block key={`${s}${i}`} x0={s * 37 - 2} x1={s * 37 + 2} y0={0} y1={(i + 1) * 0.5} z0={z1 + 14 - i - 1} z1={z1 + 14 - i} m={steel} />
          )),
        )}
        {/* Consoles */}
        {[-24, -12, 12, 24].map((x) => (
          <group key={`c${x}`} position={[x, deckY, z0 + 9]}>
            <Block x0={-4} x1={4} y0={0} y1={1.1} z0={-1} z1={1} m={desk} />
            <mesh position={[0, 1.3, 0.2]} rotation-x={-0.6} raycast={noRaycast}>
              <boxGeometry args={[7.6, 0.1, 1.4]} />
              <meshStandardMaterial color="#1a1f25" roughness={0.3} metalness={0.5} />
            </mesh>
          </group>
        ))}
        {/* The map table */}
        <Cyl x={0} y={deckY + 0.5} z={z0 + 8} r={3} h={1} m={desk} />
      </Static>
      {/* Screens and the hologram */}
      <mesh position={[0, deckY + 8, z0 + 0.5]} raycast={noRaycast}>
        <planeGeometry args={[40, 16]} />
        <meshBasicMaterial map={wall} toneMapped={false} />
      </mesh>
      {[-24, -12, 12, 24].flatMap((x) =>
        [-2.4, 0, 2.4].map((dx, i) => (
          <mesh key={`${x}${dx}`} position={[x + dx, deckY + 2.2, z0 + 8.2]} rotation-x={-0.2} raycast={noRaycast}>
            <planeGeometry args={[2.1, 1.3]} />
            <meshBasicMaterial color={i === 1 ? "#29d17a" : "#2a8cff"} toneMapped={false} />
          </mesh>
        )),
      )}
      <mesh position={[0, deckY + 1.03, z0 + 8]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <circleGeometry args={[2.8, 48]} />
        <meshBasicMaterial color="#3fbfff" transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <mesh ref={holo} position={[0, deckY + 3, z0 + 8]} raycast={noRaycast}>
        <icosahedronGeometry args={[1.6, 1]} />
        <meshBasicMaterial color="#7fe3ff" wireframe transparent opacity={0.7} toneMapped={false} />
      </mesh>
      <mesh position={[0, deckY + 2, z0 + 8]} raycast={noRaycast}>
        <cylinderGeometry args={[2.6, 2.8, 2, 32, 1, true]} />
        <meshBasicMaterial color="#3fbfff" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Crates() {
  const wood = surface("planks", "#8a6a44", 0.9);
  const drum = mat("#2f5d8a", 0.5, 0.4);
  const drumRed = mat("#b8322a", 0.5, 0.4);
  return (
    <Static>
      {[
        [-41.5, -66, 0],
        [-41.5, -66, 1],
        [-39.5, -63.5, 0],
        [-43.5, -63.5, 0],
        [-41.5, -63.5, 1],
      ].map(([x, z, l], i) => (
        <group key={i} position={[x, l * 2.2, z]}>
          <Block x0={-1.1} x1={1.1} y0={0} y1={2.2} z0={-1.1} z1={1.1} m={wood} cast />
        </group>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <Cyl key={`d${i}`} x={39.5 + (i % 4) * 1.6} y={0.9} z={-15 + Math.floor(i / 4) * 1.6} r={0.7} h={1.8} m={i % 3 ? drum : drumRed} />
      ))}
    </Static>
  );
}

// ---- The helipad ---------------------------------------------------------------------------------------

function Helipad() {
  const P = BASE_HELIPAD;
  const y = groundAt(P.x, P.z);
  const markings = useCanvas(512, 512, (g) => {
    g.fillStyle = "#3b3f45";
    g.fillRect(0, 0, 512, 512);
    const r = seededRandom(4);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.08)";
      g.fillRect(r() * 512, r() * 512, 2, 2);
    }
    g.strokeStyle = "#f2c12e";
    g.lineWidth = 18;
    g.beginPath();
    g.arc(256, 256, 200, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#ffffff";
    g.fillRect(170, 140, 40, 232);
    g.fillRect(302, 140, 40, 232);
    g.fillRect(210, 236, 92, 40);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 6;
    g.strokeRect(20, 20, 472, 472);
  });
  const lights = useRef<THREE.Group>(null);
  const sock = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    lights.current?.children.forEach((c, i) => ((c as THREE.Mesh).visible = Math.floor(t * 2 + i / 4) % 2 === 0 || i % 2 === 0));
    if (sock.current) sock.current.rotation.y = 0.6 + Math.sin(t * 0.6) * 0.25;
  });
  const concrete = surface("concrete", "#9a9893", 0.9);
  const steel = mat("#7d848c", 0.35, 0.8);
  const orange = mat("#ff7a1a", 0.6);
  const white = mat("#f2f2f0", 0.6);
  return (
    <group position={[P.x, y, P.z]}>
      <Static>
        <Cyl x={0} y={0.25} z={0} r={P.r + 1.5} h={0.5} m={concrete} />
        {/* A little control hut and a fuel tank */}
        <group position={[P.r + 9, 0, -4]}>
          <Block x0={-2.5} x1={2.5} y0={0} y1={3.4} z0={-2.5} z1={2.5} m={mat("#4d5a45", 0.8)} cast />
          <Block x0={-2.8} x1={2.8} y0={3.4} y1={3.7} z0={-2.8} z1={2.8} m={steel} />
          <Block x0={-2.52} x1={-2.5} y0={1.4} y1={2.8} z0={-1.5} z1={1.5} m={mat("#24323b", 0.06, 0.8)} />
        </group>
        <group position={[P.r + 8, 0, 6]}>
          <mesh position-y={1.6} rotation-z={Math.PI / 2} material={white} castShadow raycast={noRaycast}>
            <capsuleGeometry args={[1.2, 3.4, 6, 16]} />
          </mesh>
          <Block x0={-2} x1={-1.6} y0={0} y1={0.8} z0={-0.6} z1={0.6} m={steel} />
          <Block x0={1.6} x1={2} y0={0} y1={0.8} z0={-0.6} z1={0.6} m={steel} />
        </group>
        {/* The windsock's pole */}
        <Cyl x={-P.r - 5} y={4} z={0} r={0.1} h={8} m={steel} />
      </Static>
      <mesh rotation-x={-Math.PI / 2} position-y={0.52} raycast={noRaycast}>
        <circleGeometry args={[P.r + 1.2, 64]} />
        <meshStandardMaterial map={markings} roughness={0.85} />
      </mesh>
      <group ref={lights}>
        {Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2).map((a) => (
          <mesh key={a} position={[Math.cos(a) * (P.r + 1), 0.62, Math.sin(a) * (P.r + 1)]} raycast={noRaycast}>
            <cylinderGeometry args={[0.2, 0.25, 0.22, 10]} />
            <meshBasicMaterial color={Math.round(a * 10) % 2 ? "#2fff6b" : "#ffffff"} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <group ref={sock} position={[-P.r - 5, 7.6, 0]}>
        <mesh position-x={1.4} rotation-z={Math.PI / 2} material={orange} raycast={noRaycast}>
          <cylinderGeometry args={[0.3, 0.5, 2.8, 12, 1, true]} />
        </mesh>
      </group>
    </group>
  );
}
