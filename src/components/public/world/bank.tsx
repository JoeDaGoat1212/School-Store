"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BANK, BANK_LOOT, BANK_PLAN as P, CAMERAS, PODIUM, STAFF_DESKS, cameraYaw, gateOn, sweepBeam, type BankLoot } from "./bank-layout";
import { bank, camerasLooped, drilling, DRILL_TIME } from "./bank-heist";
import { Block, Cyl, GLASS, mat, useDrawn } from "./buildings";
import { AlarmLight, Person, SlidingDoors, backOut, checker, clamp01, ease, useCanvas, useTakenAnim } from "./city-sites";
import { VAULT, game, vaultLasers, vaultLasersOn, vaultTime } from "./heist";
import { COP_LOOK, Humanoid, newPose } from "./humanoid";
import { noRaycast, signTexture } from "./paint";
import { puff } from "./smoke";
import { letterGeometry } from "./text3d";

/*
 * City Bank (bank-layout.ts has the plan, bank-heist.ts and heist.ts the
 * robbery): a grand stone bank up on a rusticated podium, with sweeping
 * steps, a colonnade, a pediment and a gold dome. Inside, a marble banking
 * hall with chandeliers, the tellers' counter and a security officer on
 * patrol; behind the keycard door, the staff area, the manager's office, the
 * security room (a wall of CCTV screens) and the ramp down. Underneath, the
 * vault level: a laser corridor, the antechamber with its cameras, and the
 * vault behind a huge round door, full of gold and cash.
 */

const W = P.halfW;
const D = P.depth;
const H = P.height;
const T = P.wall;
const alarmOn = () => game.sites.bank.alarm;

// ---- Pictures drawn once ------------------------------------------------------------------------

function stoneTexture(g: CanvasRenderingContext2D, base: string, joint: string, rows: number) {
  g.fillStyle = joint;
  g.fillRect(0, 0, 512, 512);
  const h = 512 / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < 4; c++) {
      const x = c * 128 + (r % 2) * 64;
      const shade = 0.92 + ((r * 7 + c * 13) % 9) / 60;
      const col = new THREE.Color(base).multiplyScalar(shade);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(x + 3, r * h + 3, 122, h - 6);
      g.fillRect(x - 512 + 3, r * h + 3, 122, h - 6);
      // A soft bevel.
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(x + 3, r * h + 3, 122, 3);
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(x + 3, r * h + h - 6, 122, 3);
    }
}

function useMat(key: string, make: () => THREE.Material) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const m = useMemo(make, [key]);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

// ---- The building -------------------------------------------------------------------------------

export function Bank() {
  const rustic = useCanvas(512, 512, (g) => stoneTexture(g, "#cdbf9f", "#9c8f74", 4), [6, 1]);
  const ashlar = useCanvas(512, 512, (g) => stoneTexture(g, "#efe6d2", "#cbbfa6", 8), [7, 3]);
  const marble = useCanvas(256, 256, (g) => checker(g, "#f4efe6", "#d9cfbf", "rgba(150,130,110,0.25)"), [Math.round((W * 2) / 5), Math.round(D / 5)]);
  const podiumMat = useMat("podium", () => new THREE.MeshStandardMaterial({ map: rustic, roughness: 0.9 }));
  const wallMat = useMat("walls", () => new THREE.MeshStandardMaterial({ map: ashlar, roughness: 0.85 }));
  const floorMat = useMat("floor", () => new THREE.MeshStandardMaterial({ map: marble, roughness: 0.18, metalness: 0.05 }));
  const cream = mat("#f3ead6", 0.7);
  const trim = mat("#fffaf0", 0.6);
  const gold = mat("#e8b931", 0.25, 0.85, "#3a2600");
  const letters = useMemo(() => letterGeometry("CITY BANK", 1.6, 0.35), []);
  const pediment = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-20, 0);
    s.lineTo(20, 0);
    s.lineTo(0, 6);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 5, bevelEnabled: false });
  }, []);
  useEffect(() => () => pediment.dispose(), [pediment]);
  const steps = P.steps;

  return (
    <group position={[BANK.x, 0, BANK.z]}>
      {/* ---- The podium: rusticated stone all round, and the porch on top ---- */}
      <Block x0={-W} x1={W} y0={0} y1={PODIUM} z0={-T} z1={P.porch} m={podiumMat} cast />
      <Block x0={-W} x1={-W + T} y0={0} y1={PODIUM} z0={-D} z1={-T} m={podiumMat} cast />
      <Block x0={W - T} x1={W} y0={0} y1={PODIUM} z0={-D} z1={-T} m={podiumMat} cast />
      <Block x0={-W} x1={W} y0={0} y1={PODIUM} z0={-D} z1={-D + T} m={podiumMat} cast />
      <Block x0={-W - 0.3} x1={W + 0.3} y0={PODIUM - 0.4} y1={PODIUM + 0.05} z0={-D - 0.3} z1={P.porch + 0.3} m={trim} />
      {/* The steps (each a stone slab), with a balustrade and lamps either side */}
      {Array.from({ length: 13 }, (_, k) => (
        <Block key={k} x0={-steps.halfW} x1={steps.halfW} y0={0} y1={PODIUM * (1 - (k + 0.5) / 13)} z0={P.porch + k} z1={P.porch + k + 1.02} m={mat(k % 2 ? "#e9e2d3" : "#e3dccb", 0.75)} />
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (steps.halfW + 0.6), PODIUM / 2 - 0.2, P.porch + steps.depth / 2]} rotation-x={Math.atan2(PODIUM, steps.depth)} castShadow raycast={noRaycast}>
            <boxGeometry args={[1.2, 1.4, Math.hypot(PODIUM, steps.depth) + 0.6]} />
            <primitive object={podiumMat} attach="material" />
          </mesh>
          <group position={[s * (steps.halfW + 0.6), 0, P.porch + steps.depth + 0.4]}>
            <Block x0={-0.8} x1={0.8} y0={0} y1={1.6} z0={-0.8} z1={0.8} m={podiumMat} />
            <Cyl x={0} y={3.4} z={0} r={0.12} h={3.6} m={mat("#1b1d21", 0.4, 0.7)} />
            <mesh position-y={5.5} raycast={noRaycast}>
              <sphereGeometry args={[0.55, 16, 12]} />
              <meshStandardMaterial color="#fff6dc" emissive="#ffe0a0" emissiveIntensity={1.4} />
            </mesh>
          </group>
        </group>
      ))}

      {/* ---- The hall: ashlar walls with tall arched windows ---- */}
      <group position-y={PODIUM}>
        <Block x0={-W} x1={-P.doorHalf} y0={0} y1={H} z0={-T} z1={0} m={wallMat} cast />
        <Block x0={P.doorHalf} x1={W} y0={0} y1={H} z0={-T} z1={0} m={wallMat} cast />
        <Block x0={-P.doorHalf} x1={P.doorHalf} y0={P.doorHeight} y1={H} z0={-T} z1={0} m={wallMat} cast />
        <Block x0={-W} x1={-W + T} y0={0} y1={H} z0={-D} z1={-T} m={wallMat} cast />
        <Block x0={W - T} x1={W} y0={0} y1={H} z0={-D} z1={P.fireExit.lz - P.fireExit.half} m={wallMat} cast />
        <Block x0={W - T} x1={W} y0={0} y1={H} z0={P.fireExit.lz + P.fireExit.half} z1={-T} m={wallMat} cast />
        <Block x0={W - T} x1={W} y0={3.4} y1={H} z0={P.fireExit.lz - P.fireExit.half} z1={P.fireExit.lz + P.fireExit.half} m={wallMat} />
        <Block x0={-W} x1={W} y0={0} y1={H} z0={-D} z1={-D + T} m={wallMat} cast />
        {/* Cornice and roof */}
        <Block x0={-W - 0.8} x1={W + 0.8} y0={H - 1.4} y1={H} z0={-D - 0.8} z1={0.8} m={trim} cast />
        <Block x0={-W} x1={W} y0={H} y1={H + 0.8} z0={-D} z1={0} m={cream} cast />
        {/* Balustrade round the roof */}
        {[-1, 1].map((s) => (
          <Block key={s} x0={s < 0 ? -W : W - 0.5} x1={s < 0 ? -W + 0.5 : W} y0={H + 0.8} y1={H + 2} z0={-D} z1={0} m={trim} />
        ))}
        <Block x0={-W} x1={W} y0={H + 0.8} y1={H + 2} z0={-D} z1={-D + 0.5} m={trim} />
        {/* Tall arched windows down both sides (glass with mullions) */}
        {[-1, 1].flatMap((side) =>
          [-6, -14, -24, -40].map((z) => (
            <group key={`${side}${z}`} position={[side * (W + 0.02), 5.6, z]} rotation-y={(side * Math.PI) / 2}>
              <mesh geometry={WINDOW_GEO} raycast={noRaycast}>
                <meshStandardMaterial color="#5f86a3" roughness={0.06} metalness={0.75} />
              </mesh>
              <mesh position-z={0.05} raycast={noRaycast}>
                <boxGeometry args={[0.12, 7.6, 0.1]} />
                <primitive object={trim} attach="material" />
              </mesh>
              {[-1.4, 0.6, 2.6].map((y) => (
                <mesh key={y} position={[0, y, 0.05]} raycast={noRaycast}>
                  <boxGeometry args={[3.2, 0.1, 0.1]} />
                  <primitive object={trim} attach="material" />
                </mesh>
              ))}
            </group>
          )),
        )}
        {/* ---- The portico: columns, a frieze with the name, the pediment ---- */}
        {P.columns.map((x) => (
          <group key={x} position={[x, 0, P.columnZ]}>
            <Block x0={-1.2} x1={1.2} y0={0} y1={0.8} z0={-1.2} z1={1.2} m={trim} />
            <mesh position-y={6.2} castShadow raycast={noRaycast} geometry={COLUMN_GEO}>
              <primitive object={trim} attach="material" />
            </mesh>
            <Block x0={-1.3} x1={1.3} y0={11.6} y1={12.4} z0={-1.3} z1={1.3} m={trim} />
          </group>
        ))}
        <Block x0={-20} x1={20} y0={12.4} y1={H + 0.4} z0={-0.4} z1={P.porch} m={cream} cast />
        <mesh geometry={pediment} position={[0, H + 0.4, -0.4]} castShadow raycast={noRaycast}>
          <primitive object={cream} attach="material" />
        </mesh>
        <mesh geometry={letters} position={[0, 12.85, P.porch + 0.05]} raycast={noRaycast}>
          <primitive object={gold} attach="material" />
        </mesh>
        {/* The gold dome, on a drum, with a lantern */}
        <group position={[0, H + 0.8, -D / 2]}>
          <Cyl x={0} y={1.2} z={0} r={9} h={2.4} m={trim} />
          {Array.from({ length: 16 }, (_, i) => (
            <mesh key={i} position={[Math.cos((i / 16) * Math.PI * 2) * 9.05, 1.2, Math.sin((i / 16) * Math.PI * 2) * 9.05]} rotation-y={-(i / 16) * Math.PI * 2} raycast={noRaycast}>
              <boxGeometry args={[0.1, 1.6, 0.8]} />
              <meshStandardMaterial color="#2a3a48" roughness={0.1} metalness={0.6} />
            </mesh>
          ))}
          <mesh position-y={2.4} castShadow raycast={noRaycast}>
            <sphereGeometry args={[8.4, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <primitive object={gold} attach="material" />
          </mesh>
          <Cyl x={0} y={11.2} z={0} r={1} h={1.8} m={trim} />
          <mesh position-y={12.8} raycast={noRaycast}>
            <sphereGeometry args={[1, 16, 12]} />
            <primitive object={gold} attach="material" />
          </mesh>
        </group>
        <group position-z={0}>
          <SlidingDoors site={BANK} half={P.doorHalf} height={P.doorHeight} />
        </group>
        <AlarmLight position={[-W + 1.2, H + 2.6, 1.2]} on={alarmOn} />
        <AlarmLight position={[W - 1.2, H + 2.6, 1.2]} on={alarmOn} />
        <Hall floorMat={floorMat} />
      </group>
      <FireStairs />
      <VaultLevel />
    </group>
  );
}

const WINDOW_GEO = (() => {
  const s = new THREE.Shape();
  s.moveTo(-1.6, -3.8);
  s.lineTo(1.6, -3.8);
  s.lineTo(1.6, 2.2);
  s.absarc(0, 2.2, 1.6, 0, Math.PI, false);
  s.lineTo(-1.6, -3.8);
  return new THREE.ShapeGeometry(s, 16);
})();
const COLUMN_GEO = (() => {
  // A fluted column: a cylinder with shallow grooves.
  const g = new THREE.CylinderGeometry(0.85, 0.95, 10.8, 32, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 - 0.05 * Math.max(0, Math.cos(a * 16));
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  g.computeVertexNormals();
  return g;
})();

// ---- Inside: the banking hall and the back rooms (in the hall's frame: y = 0 is its floor) ------

function Hall({ floorMat }: { floorMat: THREE.Material }) {
  const R = P.ramp;
  const C = P.counter;
  const wood = mat("#6b4329", 0.5);
  const darkWood = mat("#4a2c1a", 0.45);
  const brass = mat("#c9a227", 0.3, 0.85);
  const green = mat("#1f5c46", 0.35);
  const steel = mat("#9aa3ad", 0.3, 0.8);
  const teller = useMemo(() => P.tellers.map((_, n) => signTexture(`Teller ${n + 1}`, { bg: "#1b1d21", fg: "#e8b931", height: 64, font: "body" })), []);
  const staff = useMemo(() => signTexture("Staff only", { bg: "#8c1c13", fg: "#ffffff", height: 64 }), []);
  const monitors = useDrawn(1024, 512, (g) => {
    g.fillStyle = "#0b0e14";
    g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 8; i++) {
      const x = (i % 4) * 256 + 8;
      const y = Math.floor(i / 4) * 256 + 8;
      const grd = g.createLinearGradient(x, y, x + 240, y + 240);
      grd.addColorStop(0, "#2c3e35");
      grd.addColorStop(1, "#16211c");
      g.fillStyle = grd;
      g.fillRect(x, y, 240, 240);
      g.strokeStyle = "rgba(160,255,190,0.25)";
      g.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.moveTo(x + 20 + k * 36, y + 220);
        g.lineTo(x + 120, y + 80);
        g.stroke();
      }
      g.fillStyle = "#9cffb8";
      g.font = "700 20px monospace";
      g.fillText(`CAM ${i + 1}`, x + 10, y + 26);
      g.fillStyle = "#ff3b30";
      g.fillRect(x + 210, y + 12, 14, 14);
    }
  });
  const floorPieces: [number, number, number, number][] = [
    [-W + T, W - T, R.top, -T],
    [-W + T, R.lx0, -D + T, R.top],
    [R.lx1, W - T, -D + T, R.top],
    [R.lx0, R.lx1, -D + T, R.bottom],
  ];
  return (
    <group>
      {/* The floor (with the hole for the ramp), and the slab under it (the vault level's ceiling) */}
      {floorPieces.map(([x0, x1, z0, z1], i) => (
        <group key={i}>
          <mesh material={floorMat} position={[(x0 + x1) / 2, 0.02, (z0 + z1) / 2]} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
            <planeGeometry args={[x1 - x0, z1 - z0]} />
          </mesh>
          <Block x0={x0} x1={x1} y0={-0.5} y1={0} z0={z0} z1={z1} m={mat("#d9d4ca", 0.9)} />
        </group>
      ))}
      {/* A coffered ceiling */}
      <Block x0={-W} x1={W} y0={H - 1.6} y1={H - 1.4} z0={-D} z1={0} m={mat("#fbf6ea", 0.8)} />
      {Array.from({ length: 7 }, (_, i) => (
        <Block key={`cx${i}`} x0={-W + 5 + i * 11} x1={-W + 5.6 + i * 11} y0={H - 2.4} y1={H - 1.6} z0={P.counter.lz1} z1={-T} m={mat("#efe4cc", 0.7)} />
      ))}
      {/* Green marble skirting round the hall */}
      <Block x0={-W + T} x1={-W + T + 0.15} y0={0} y1={2.6} z0={C.lz1} z1={-T} m={green} />
      <Block x0={W - T - 0.15} x1={W - T} y0={0} y1={2.6} z0={C.lz1} z1={-T} m={green} />
      {/* The hall's columns */}
      {P.hallColumns.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position-y={(H - 1.6) / 2} geometry={HALL_COLUMN} raycast={noRaycast}>
            <meshStandardMaterial color="#f7f1e6" roughness={0.25} />
          </mesh>
          <Cyl x={0} y={0.4} z={0} r={1.3} h={0.8} m={brass} />
          <Cyl x={0} y={H - 2} z={0} r={1.25} h={0.6} m={brass} />
        </group>
      ))}
      {/* Chandeliers */}
      {[-14, 0, 14].map((x) => (
        <Chandelier key={x} position={[x, H - 1.6, -9]} />
      ))}
      {/* Velvet ropes, writing desks, benches, plants, a clock */}
      {[-10, -5, 0, 5, 10].map((x) => (
        <Cyl key={x} x={x} y={0.7} z={-14.5} r={0.12} h={1.4} m={brass} />
      ))}
      <Block x0={-10} x1={10} y0={1.2} y1={1.32} z0={-14.56} z1={-14.44} m={mat("#8c1c13", 0.8)} />
      {[-30, 30].map((x) => (
        <group key={x}>
          <Block x0={x - 3} x1={x + 3} y0={0} y1={1.5} z0={-9} z1={-7.6} m={wood} />
          <Block x0={x - 3.2} x1={x + 3.2} y0={1.5} y1={1.62} z0={-9.1} z1={-7.5} m={mat("#e9e4da", 0.2)} />
          <Block x0={x - 3} x1={x + 3} y0={0.9} y1={1.1} z0={-4} z1={-2.6} m={darkWood} />
          <Block x0={x - 3} x1={x + 3} y0={1.1} y1={2.2} z0={-4} z1={-3.8} m={darkWood} />
        </group>
      ))}
      {[-7, 7].map((x) => (
        <group key={x} position={[x, 0, -2.4]}>
          <Cyl x={0} y={0.6} z={0} r={0.7} h={1.2} m={mat("#b5653a", 0.8)} />
          <mesh position-y={2.4} raycast={noRaycast}>
            <icosahedronGeometry args={[1.2, 1]} />
            <meshStandardMaterial color="#3f7d32" roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}
      <group position={[0, H - 4, C.lz0 - 0.1]}>
        <Cyl x={0} y={0} z={0} r={1.6} h={0.2} m={brass} rz={Math.PI / 2} />
        <mesh position-z={-0.12} rotation-x={Math.PI / 2} raycast={noRaycast}>
          <circleGeometry args={[1.4, 32]} />
          <meshStandardMaterial color="#fffaf0" side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* ---- The counter, with glass above and the tellers behind ---- */}
      <Block x0={C.lx0} x1={C.lx1} y0={0} y1={C.height} z0={C.lz0} z1={C.lz1} m={darkWood} cast />
      <Block x0={C.lx0 - 0.2} x1={C.lx1 + 0.2} y0={C.height} y1={C.height + 0.2} z0={C.lz0 - 0.2} z1={C.lz1 + 0.3} m={mat("#e9e4da", 0.15)} />
      <mesh geometry={UNIT} material={GLASS} position={[0, C.height + 1.5, (C.lz0 + C.lz1) / 2]} scale={[C.lx1 - C.lx0, 2.6, 0.08]} raycast={noRaycast} />
      {P.tellers.map((x, i) => (
        <group key={x}>
          <Block x0={x - 6} x1={x - 5.8} y0={C.height} y1={C.height + 2.8} z0={C.lz0} z1={C.lz1} m={brass} />
          <mesh position={[x, C.height + 3.4, C.lz1 + 0.05]} raycast={noRaycast}>
            <planeGeometry args={[2.4, 2.4 / teller[i].aspect]} />
            <meshBasicMaterial map={teller[i].texture} transparent toneMapped={false} />
          </mesh>
          <Person position={[x, 0, P.tellerZ]} shirt={["#13a8a0", "#3d6fe0", "#7b5cd6", "#e5483b"][i]} skin={["#e0ac83", "#8d5a3b", "#f1c7a5", "#c98e62"][i]} hair={i % 2 ? "#1b1d21" : "#6b4423"} tie={i % 2 ? "#e5483b" : undefined} scared={alarmOn} />
        </group>
      ))}
      {/* The walls either side of the counter, and the staff door with its card reader */}
      <Block x0={-W + T} x1={C.lx0} y0={0} y1={H - 1.6} z0={C.lz0} z1={C.lz1} m={mat("#efe6d2", 0.8)} />
      <Block x0={C.lx1} x1={P.staffDoor.lx - P.staffDoor.half} y0={0} y1={H - 1.6} z0={C.lz0} z1={C.lz1} m={mat("#efe6d2", 0.8)} />
      <Block x0={P.staffDoor.lx + P.staffDoor.half} x1={W - T} y0={0} y1={H - 1.6} z0={C.lz0} z1={C.lz1} m={mat("#efe6d2", 0.8)} />
      <Block x0={P.staffDoor.lx - P.staffDoor.half} x1={P.staffDoor.lx + P.staffDoor.half} y0={4} y1={H - 1.6} z0={C.lz0} z1={C.lz1} m={mat("#efe6d2", 0.8)} />
      <StaffDoor />
      <mesh position={[P.staffDoor.lx, 4.6, C.lz1 + 0.05]} raycast={noRaycast}>
        <planeGeometry args={[2.8, 2.8 / staff.aspect]} />
        <meshBasicMaterial map={staff.texture} transparent toneMapped={false} />
      </mesh>
      {/* ---- The staff area: desks with screens ---- */}
      {STAFF_DESKS.map((x) => (
        <group key={x} position={[x, 0, -25]}>
          <Block x0={-1.6} x1={1.6} y0={1.4} y1={1.55} z0={-0.6} z1={0.6} m={wood} />
          <Block x0={-1.5} x1={-1.3} y0={0} y1={1.4} z0={-0.5} z1={0.5} m={steel} />
          <Block x0={1.3} x1={1.5} y0={0} y1={1.4} z0={-0.5} z1={0.5} m={steel} />
          <Block x0={-0.8} x1={0.8} y0={1.7} y1={2.7} z0={-0.35} z1={-0.28} m={mat("#111317", 0.2, 0.3, "#16304a")} />
          <Cyl x={0} y={0.9} z={1.2} r={0.5} h={0.1} m={mat("#1b1d21", 0.6)} />
        </group>
      ))}
      {[-34, -31].map((x) => (
        <Block key={x} x0={x - 1.2} x1={x + 1.2} y0={0} y1={3.2} z0={-28} z1={-26.6} m={steel} />
      ))}
      {/* ---- The back rooms' wall, and the walls between them ---- */}
      {[
        [-W + T, P.officeDoor.lx - P.officeDoor.half],
        [P.officeDoor.lx + P.officeDoor.half, P.securityDoor.lx - P.securityDoor.half],
        [P.securityDoor.lx + P.securityDoor.half, P.stairDoor.lx - P.stairDoor.half],
        [P.stairDoor.lx + P.stairDoor.half, W - T],
      ].map(([x0, x1]) => (
        <Block key={x0} x0={x0} x1={x1} y0={0} y1={H - 1.6} z0={P.backWall.lz0} z1={P.backWall.lz1} m={mat("#e9e0cc", 0.85)} />
      ))}
      {[P.officeDoor, P.securityDoor, P.stairDoor].map((d) => (
        <Block key={d.lx} x0={d.lx - d.half} x1={d.lx + d.half} y0={3.6} y1={H - 1.6} z0={P.backWall.lz0} z1={P.backWall.lz1} m={mat("#e9e0cc", 0.85)} />
      ))}
      <Block x0={P.officeWallX - 0.5} x1={P.officeWallX + 0.5} y0={0} y1={H - 1.6} z0={-D + T} z1={P.backWall.lz0} m={mat("#e9e0cc", 0.85)} />
      <Block x0={P.securityWallX - 0.5} x1={P.securityWallX + 0.5} y0={0} y1={H - 1.6} z0={-D + T} z1={P.backWall.lz0} m={mat("#e9e0cc", 0.85)} />
      {/* The manager's office: a big desk, a bookcase, a little safe, a rug */}
      <Block x0={-30} x1={-22} y0={0} y1={1.5} z0={-36} z1={-34.4} m={darkWood} cast />
      <Block x0={-30.2} x1={-21.8} y0={1.5} y1={1.62} z0={-36.1} z1={-34.3} m={mat("#2a3442", 0.3)} />
      <Block x0={-W + T} x1={-W + T + 1} y0={0} y1={7} z0={-40} z1={-32} m={wood} />
      {[1.4, 2.8, 4.2, 5.6].map((y) => (
        <Block key={y} x0={-W + T + 0.1} x1={-W + T + 0.9} y0={y} y1={y + 0.9} z0={-39.6} z1={-32.4} m={mat(["#7b1e1e", "#1d4f91", "#2d6a4f", "#c9a227"][Math.round(y) % 4], 0.8)} />
      ))}
      <Block x0={-18} x1={-15.6} y0={0} y1={2.4} z0={-41} z1={-38.6} m={mat("#3b4046", 0.4, 0.7)} />
      {/* The security room: a wall of CCTV screens and the desk (loop the cameras here) */}
      <mesh position={[(P.officeWallX + P.securityWallX) / 2, 4.6, -D + T + 0.06]} raycast={noRaycast}>
        <planeGeometry args={[20, 10]} />
        <meshStandardMaterial map={monitors} emissive="#ffffff" emissiveMap={monitors} emissiveIntensity={0.75} />
      </mesh>
      <Block x0={P.cctv.lx - 3} x1={P.cctv.lx + 3} y0={0} y1={1.5} z0={P.cctv.lz - 0.8} z1={P.cctv.lz + 0.8} m={mat("#2b2f36", 0.4, 0.5)} cast />
      <LoopLight />
      {/* The stair room: the ramp's steps going down, and the railings */}
      <Ramp />
      {[R.lx0 - 0.2, R.lx1 + 0.2].map((x) => (
        <group key={x}>
          <Block x0={x - 0.08} x1={x + 0.08} y0={1.05} y1={1.2} z0={-D + T} z1={R.top - 2.5} m={brass} />
          {Array.from({ length: 6 }, (_, i) => (
            <Cyl key={i} x={x} y={0.55} z={R.top - 2.6 - i * 1.6} r={0.06} h={1.1} m={brass} />
          ))}
        </group>
      ))}
      {/* The fire exit door (push bar) */}
      <FireDoor />
      <AlarmLight position={[-W + 1.2, 10, -8]} turn={Math.PI / 2} on={alarmOn} />
      <AlarmLight position={[W - 1.2, 10, -8]} turn={-Math.PI / 2} on={alarmOn} />
      <AlarmLight position={[0, 10, -D + T + 0.6]} on={alarmOn} />
      {CAMERAS.filter((c) => c.level === 1).map((c) => (
        <SecurityCamera key={c.id} cam={c} y={c.y - PODIUM} />
      ))}
      <Guard />
    </group>
  );
}

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const HALL_COLUMN = new THREE.CylinderGeometry(0.95, 0.95, H - 1.6, 28);

function Chandelier({ position }: { position: [number, number, number] }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.y = Math.sin(clock.elapsedTime * 0.3) * 0.05;
  });
  return (
    <group ref={g} position={position}>
      <Cyl x={0} y={-1} z={0} r={0.05} h={2} m={mat("#c9a227", 0.3, 0.85)} />
      <mesh position-y={-2.2} raycast={noRaycast}>
        <torusGeometry args={[1.6, 0.08, 8, 32]} />
        <meshStandardMaterial color="#c9a227" metalness={0.85} roughness={0.3} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 1.6, -1.95, Math.sin(a) * 1.6]} raycast={noRaycast}>
            <sphereGeometry args={[0.18, 10, 8]} />
            <meshStandardMaterial color="#fff6dc" emissive="#ffe2a8" emissiveIntensity={2.2} />
          </mesh>
        );
      })}
      <mesh position-y={-2.8} raycast={noRaycast}>
        <octahedronGeometry args={[0.5, 0]} />
        <meshPhysicalMaterial color="#ffffff" roughness={0} metalness={0} transmission={0.6} thickness={0.5} />
      </mesh>
    </group>
  );
}

/** The steel staff door: slides open for a keycard (and from the staff side). The reader goes green. */
function StaffDoor() {
  const door = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (door.current) door.current.position.x = P.staffDoor.lx + bank.staffOpen * (P.staffDoor.half * 2 - 0.2);
    const ok = bank.staffOpen > 0.05;
    led.current?.color.set(ok ? "#2fbf4a" : "#e5402b");
    led.current?.emissive.set(ok ? "#2fbf4a" : "#e5402b");
  });
  return (
    <group>
      <group ref={door} position={[P.staffDoor.lx, 0, (P.counter.lz0 + P.counter.lz1) / 2]}>
        <mesh geometry={UNIT} position-y={2} scale={[P.staffDoor.half * 2, 4, 0.3]} raycast={noRaycast}>
          <meshStandardMaterial color="#8d99a6" roughness={0.35} metalness={0.75} />
        </mesh>
        <mesh geometry={UNIT} position={[0, 2.6, 0.17]} scale={[0.8, 1, 0.04]} raycast={noRaycast}>
          <meshStandardMaterial color="#9fc6dd" roughness={0.1} metalness={0.4} />
        </mesh>
      </group>
      <group position={[P.staffDoor.lx - P.staffDoor.half - 0.6, 2, P.counter.lz1 + 0.05]}>
        <mesh geometry={UNIT} scale={[0.5, 0.8, 0.12]} raycast={noRaycast}>
          <meshStandardMaterial color="#1b1d21" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.25, 0.07]} raycast={noRaycast}>
          <circleGeometry args={[0.09, 12]} />
          <meshStandardMaterial ref={led} color="#e5402b" emissive="#e5402b" emissiveIntensity={2} />
        </mesh>
      </group>
    </group>
  );
}

function FireDoor() {
  const door = useRef<THREE.Group>(null);
  useFrame(() => {
    if (door.current) door.current.rotation.y = -bank.fireOpen * 1.6;
  });
  return (
    <group position={[W - T / 2, 0, P.fireExit.lz + P.fireExit.half]}>
      <group ref={door}>
        <mesh geometry={UNIT} position={[0, 1.7, -P.fireExit.half]} scale={[0.2, 3.4, P.fireExit.half * 2]} raycast={noRaycast}>
          <meshStandardMaterial color="#c0392b" roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh geometry={UNIT} position={[-0.15, 1.3, -P.fireExit.half]} scale={[0.08, 0.12, P.fireExit.half * 1.6]} raycast={noRaycast}>
          <meshStandardMaterial color="#c9ced4" roughness={0.3} metalness={0.8} />
        </mesh>
      </group>
      <mesh position={[-0.6, 4, -P.fireExit.half]} rotation-y={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[2, 0.6]} />
        <meshStandardMaterial color="#1f9d55" emissive="#1f9d55" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

/** A green light on the CCTV desk while the cameras are looped (and a progress bar while you're doing it). */
function LoopLight() {
  const bar = useRef<THREE.Mesh>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const k = bank.loop >= 0 ? bank.loop / 6 : camerasLooped() ? 1 : 0;
    if (bar.current) {
      bar.current.scale.x = Math.max(0.001, k);
      bar.current.visible = k > 0;
    }
    led.current?.emissive.set(camerasLooped() ? "#2fbf4a" : "#e5402b");
  });
  return (
    <group position={[P.cctv.lx, 1.56, P.cctv.lz]}>
      <mesh ref={bar} position={[0, 0.02, 0.3]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[4, 0.3]} />
        <meshBasicMaterial color="#2fbf4a" toneMapped={false} />
      </mesh>
      <mesh position={[2.4, 0.15, 0]} raycast={noRaycast}>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshStandardMaterial ref={led} color="#222" emissive="#e5402b" emissiveIntensity={2} />
      </mesh>
      <Block x0={-2} x1={2} y0={0.1} y1={1.4} z0={-0.4} z1={-0.32} m={mat("#111317", 0.2, 0.3, "#103a28")} />
    </group>
  );
}

/** The ramp down to the vault level, drawn as a flight of steps (in the hall's frame, so it goes down below 0). */
function Ramp() {
  const R = P.ramp;
  const n = 14;
  return (
    <group>
      {Array.from({ length: n }, (_, k) => {
        const z0 = R.top - ((k + 1) * (R.top - R.bottom)) / n;
        const z1 = R.top - (k * (R.top - R.bottom)) / n;
        const y = -PODIUM * ((k + 0.5) / n);
        return <Block key={k} x0={R.lx0} x1={R.lx1} y0={y - 0.35} y1={y} z0={z0} z1={z1} m={mat(k % 2 ? "#b9b6ae" : "#aeaba3", 0.8)} />;
      })}
      {/* The shaft's walls (seen from the vault level too) */}
      <Block x0={R.lx0 - 0.4} x1={R.lx0} y0={-PODIUM} y1={0} z0={R.bottom} z1={R.top} m={mat("#c9c4b8", 0.9)} />
      <Block x0={R.lx1} x1={R.lx1 + 0.4} y0={-PODIUM} y1={0} z0={-D + T} z1={R.top} m={mat("#c9c4b8", 0.9)} />
    </group>
  );
}

/** A security camera on its bracket: the head sweeps, the light is red while it's recording (green when looped). */
function SecurityCamera({ cam, y }: { cam: (typeof CAMERAS)[number]; y: number }) {
  const head = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const cone = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    if (head.current) head.current.rotation.y = cameraYaw(cam, game.now);
    const looped = camerasLooped();
    led.current?.emissive.set(looped ? "#2fbf4a" : bank.seen > 0 ? (Math.floor(game.now * 8) % 2 ? "#ff3b30" : "#ffcc00") : "#ff3b30");
    if (cone.current) cone.current.opacity = looped || game.sites.bank.alarm ? 0 : 0.06 + bank.seen * 0.15;
  });
  return (
    <group position={[cam.lx, y, cam.lz]}>
      <Block x0={-0.15} x1={0.15} y0={0} y1={0.8} z0={-0.15} z1={0.15} m={mat("#2b2f36", 0.4, 0.6)} />
      <group ref={head}>
        <mesh geometry={UNIT} position={[0, -0.1, 0.4]} scale={[0.45, 0.4, 0.9]} raycast={noRaycast}>
          <meshStandardMaterial color="#e9ecef" roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.1, 0.86]} rotation-x={Math.PI / 2} raycast={noRaycast}>
          <cylinderGeometry args={[0.15, 0.15, 0.05, 14]} />
          <meshStandardMaterial color="#111" roughness={0.05} metalness={0.5} />
        </mesh>
        <mesh position={[0.15, 0.08, 0.6]} raycast={noRaycast}>
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshStandardMaterial ref={led} color="#300" emissive="#ff3b30" emissiveIntensity={3} />
        </mesh>
        {/* Its view, a faint cone */}
        <mesh position={[0, -1.8, cam.range / 2 + 0.8]} rotation-x={-Math.PI / 2 + 0.25} raycast={noRaycast}>
          <coneGeometry args={[cam.range * 0.45, cam.range, 24, 1, true]} />
          <meshBasicMaterial ref={cone} color="#ff6b5a" transparent opacity={0.06} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** The security officer on patrol in the hall, with the keycard on his belt. */
function Guard() {
  const g = useRef<THREE.Group>(null);
  const pose = useMemo(newPose, []);
  const look = useMemo(() => ({ ...COP_LOOK, skin: "#e0ac83", hair: "#2a1a12" }), []);
  useFrame((_, dt) => {
    const s = bank.guard;
    if (!g.current) return;
    g.current.position.set(s.x - BANK.x, 0, s.z - BANK.z);
    g.current.rotation.y = s.yaw;
    pose.gait = THREE.MathUtils.damp(pose.gait, s.walking ? 1 : 0, 8, dt);
    if (s.walking) pose.phase += dt * 3.2;
    pose.aim = THREE.MathUtils.damp(pose.aim, s.alert, 6, dt);
    pose.keycard = s.keycard;
  });
  return (
    <group ref={g}>
      <Humanoid look={look} pose={pose} />
    </group>
  );
}

// ---- The fire stairs down the outside ----------------------------------------------------------

function FireStairs() {
  const F = P.fireStairs;
  const steel = mat("#3b4046", 0.5, 0.7);
  const n = 16;
  return (
    <group>
      {/* The landing outside the fire exit */}
      <Block x0={F.lx0} x1={F.lx1} y0={PODIUM - 0.3} y1={PODIUM} z0={F.top - 2} z1={F.top} m={steel} cast />
      {Array.from({ length: n }, (_, k) => {
        const z0 = F.top + (k * (F.bottom - F.top)) / n;
        const y = PODIUM * (1 - (k + 0.5) / n);
        return <Block key={k} x0={F.lx0 + 0.3} x1={F.lx1} y0={y - 0.12} y1={y} z0={z0} z1={z0 + (F.bottom - F.top) / n + 0.05} m={steel} />;
      })}
      {/* Rails and posts */}
      {[F.lx1 - 0.1].map((x) => (
        <group key={x}>
          <mesh position={[x, PODIUM / 2 + 1.1, (F.top + F.bottom) / 2]} rotation-x={Math.atan2(PODIUM, F.bottom - F.top)} raycast={noRaycast}>
            <boxGeometry args={[0.1, 0.1, Math.hypot(PODIUM, F.bottom - F.top)]} />
            <primitive object={steel} attach="material" />
          </mesh>
          {Array.from({ length: 5 }, (_, i) => {
            const z = F.top + (i * (F.bottom - F.top)) / 4;
            const y = PODIUM * (1 - i / 4);
            return <Cyl key={i} x={x} y={y / 2 + 0.6} z={z} r={0.08} h={y + 1.2} m={steel} />;
          })}
        </group>
      ))}
    </group>
  );
}

// ---- The vault level (street level, y = 0) ------------------------------------------------------

function VaultLevel() {
  const concrete = mat("#a7a39a", 0.92);
  const steel = useCanvas(128, 128, (g) => {
    g.fillStyle = "#8e979f";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#717a83";
    g.lineWidth = 3;
    g.strokeRect(2, 2, 124, 124);
    g.fillStyle = "#b9c1c8";
    for (const [x, y] of [
      [10, 10],
      [118, 10],
      [10, 118],
      [118, 118],
    ])
      g.fillRect(x - 3, y - 3, 6, 6);
  }, [16, 8]);
  const lockers = useCanvas(256, 256, (g) => {
    g.fillStyle = "#8f99a3";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 6; x++) {
        g.fillStyle = (x + y) % 3 ? "#b7c0c9" : "#a9b3bd";
        g.fillRect(x * 42 + 3, y * 32 + 3, 37, 26);
        g.fillStyle = "#e0b43a";
        g.beginPath();
        g.arc(x * 42 + 31, y * 32 + 16, 3.5, 0, Math.PI * 2);
        g.fill();
      }
  }, [6, 1]);
  const warn = useMemo(() => signTexture("Danger: lasers", { bg: "#ffcc00", fg: "#1b1d21", height: 64 }), []);
  const V = P.vault;
  const C = P.corridor;
  const A = P.ante;
  const ceil = PODIUM - 0.5;
  return (
    <group>
      {/* Floors */}
      <mesh position={[0, 0.16, (V.lz0 + V.lz1) / 2]} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[V.lx1 - V.lx0 - 2, V.lz1 - V.lz0]} />
        <meshStandardMaterial map={steel} roughness={0.35} metalness={0.6} />
      </mesh>
      {[
        [A.lx0 + 1, A.lx1, A.lz0 + 1, A.lz1],
        [C.lx0, P.ramp.lx1, C.lz0 + 1, C.lz1],
      ].map(([x0, x1, z0, z1], i) => (
        <mesh key={i} position={[(x0 + x1) / 2, 0.16, (z0 + z1) / 2]} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
          <planeGeometry args={[x1 - x0, z1 - z0]} />
          <meshStandardMaterial color="#6f747a" roughness={0.6} />
        </mesh>
      ))}
      {/* Walls: the vault wall, the plant room, round the corridor and the antechamber */}
      <VaultWall />
      <Block x0={A.lx1} x1={P.ramp.lx0} y0={0} y1={ceil} z0={C.lz1} z1={P.vaultWall.lz0} m={concrete} />
      <Block x0={P.ramp.lx1} x1={W - T} y0={0} y1={ceil} z0={-D + T} z1={P.vaultWall.lz0} m={concrete} />
      <Block x0={P.ramp.lx0} x1={P.ramp.lx1} y0={0} y1={ceil} z0={P.ramp.top} z1={P.vaultWall.lz0} m={concrete} />
      {/* Strip lights */}
      {[-30, -18, -6, 6, 18, 30].map((x) => (
        <mesh key={`v${x}`} position={[x, ceil - 0.05, -10]} rotation-x={Math.PI / 2} raycast={noRaycast}>
          <planeGeometry args={[0.5, 8]} />
          <meshStandardMaterial color="#ffffff" emissive="#eef6ff" emissiveIntensity={2} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {[-26, -4, 10].map((x) => (
        <mesh key={`c${x}`} position={[x, ceil - 0.05, x < -14 ? -32 : -38.5]} rotation-x={Math.PI / 2} raycast={noRaycast}>
          <planeGeometry args={[x < -14 ? 6 : 8, 0.5]} />
          <meshStandardMaterial color="#ffffff" emissive="#eef6ff" emissiveIntensity={1.6} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Safe-deposit boxes round the vault's walls */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (W - T - 0.06), 2.8, (V.lz0 + V.lz1) / 2]} rotation-y={(-side * Math.PI) / 2} raycast={noRaycast}>
          <planeGeometry args={[V.lz1 - V.lz0 - 0.4, 5]} />
          <meshStandardMaterial map={lockers} roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 2.8, -T - 0.06]} rotation-y={Math.PI} raycast={noRaycast}>
        <planeGeometry args={[W * 2 - 2, 5]} />
        <meshStandardMaterial map={lockers} roughness={0.5} metalness={0.5} />
      </mesh>
      {/* The laser corridor: emitters on both walls at each gate, and warning signs */}
      {P.gates.map((gx) => (
        <group key={gx}>
          {[C.lz0 + T, C.lz1].map((z) => (
            <Block key={z} x0={gx - 0.25} x1={gx + 0.25} y0={0.2} y1={4.2} z0={z - 0.15} z1={z + 0.15} m={mat("#2a2e33", 0.4, 0.6)} />
          ))}
        </group>
      ))}
      <mesh position={[P.ramp.lx0 - 0.45, 3.6, -40.5]} rotation-y={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[3, 3 / warn.aspect]} />
        <meshBasicMaterial map={warn.texture} toneMapped={false} />
      </mesh>
      {/* Warm light over the vault, cool light in the corridor */}
      <pointLight position={[0, PODIUM - 1.2, -10]} intensity={60} distance={40} color="#ffe2b0" />
      <pointLight position={[-26, PODIUM - 1.2, -32]} intensity={30} distance={26} color="#dfefff" />
      <CorridorLasers />
      <VaultDoor />
      <VaultGlow />
      <VaultLasers />
      <DrillProgress />
      {BANK_LOOT.map((l) => (
        <Loot key={l.id} loot={l} />
      ))}
      {CAMERAS.filter((c) => c.level === 0).map((c) => (
        <SecurityCamera key={c.id} cam={c} y={c.y} />
      ))}
      <AlarmLight position={[-W + 1.2, ceil - 0.6, -10]} turn={Math.PI / 2} on={alarmOn} />
      <AlarmLight position={[A.lx0 + 1.2, ceil - 0.6, -30]} turn={Math.PI / 2} on={alarmOn} />
    </group>
  );
}

/** The steel wall between the antechamber and the vault, with the round hole for the door. */
function VaultWall() {
  const R = P.vaultDoor.radius;
  const ceil = PODIUM - 0.5;
  const frame = useMemo(() => {
    const s = new THREE.Shape();
    const hw = R + 1.2;
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, ceil);
    s.lineTo(-hw, ceil);
    s.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, P.vaultDoor.y, R + 0.08, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 48 });
  }, [R, ceil]);
  useEffect(() => () => frame.dispose(), [frame]);
  const z0 = P.vaultWall.lz0;
  const z1 = P.vaultWall.lz1;
  const hw = R + 1.2;
  const dx = P.vaultDoor.lx;
  const wall = mat("#7d8792", 0.45, 0.6);
  return (
    <group>
      <Block x0={-W + T} x1={dx - hw} y0={0} y1={ceil} z0={z0} z1={z1} m={wall} />
      <Block x0={dx + hw} x1={W - T} y0={0} y1={ceil} z0={z0} z1={z1} m={wall} />
      <mesh geometry={frame} position={[dx, 0, z0]} raycast={noRaycast}>
        <meshStandardMaterial color="#6f7b87" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[dx, P.vaultDoor.y, z0 - 0.15]} raycast={noRaycast}>
        <torusGeometry args={[R + 0.3, 0.35, 12, 56]} />
        <meshStandardMaterial color="#c3cbd3" roughness={0.25} metalness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * The round vault door, hinged on one side, facing the antechamber. While
 * you drill it the drill shakes and sparks fly; when it's through, the
 * wheel spins, the bolts round the rim pull in with a clunk, and the door
 * swings open.
 */
function VaultDoor() {
  const R = P.vaultDoor.radius;
  const hinge = useRef<THREE.Group>(null);
  const wheel = useRef<THREE.Group>(null);
  const bolts = useRef<(THREE.Mesh | null)[]>([]);
  const drill = useRef<THREE.Group>(null);
  const bit = useRef<THREE.Mesh>(null);
  const last = useRef(-1);
  const BOLTS = 12;
  const steel = mat("#aab4be", 0.25, 0.9);
  const shiny = mat("#d2d9e0", 0.2, 0.95);
  const brass = mat("#e8b931", 0.25, 0.85);
  useFrame((_, delta) => {
    const vt = vaultTime();
    const prev = last.current;
    last.current = vt;
    const d = drilling();
    if (drill.current) {
      drill.current.visible = d;
      drill.current.position.z = -1.4 + (d ? Math.sin(game.now * 60) * 0.04 : 0);
    }
    if (bit.current) bit.current.rotation.y += delta * 40;
    if (wheel.current) wheel.current.rotation.z = vt < 0 ? 0 : -(Math.min(vt, VAULT.spinUntil) ** 2) * 5;
    const b = vt < 0 ? 0 : ease(clamp01((vt - VAULT.spinUntil) / (VAULT.boltsUntil - VAULT.spinUntil)));
    bolts.current.forEach((m, i) => {
      if (!m) return;
      const a = (i / BOLTS) * Math.PI * 2;
      const r = R + 0.3 - b * 0.8;
      m.position.set(-R + Math.cos(a) * r, Math.sin(a) * r, 0);
    });
    const o = vt < 0 ? 0 : backOut(clamp01((vt - VAULT.boltsUntil) / (VAULT.openUntil - VAULT.boltsUntil)));
    if (hinge.current) hinge.current.rotation.y = -1.85 * o;
    if (prev < VAULT.spinUntil && vt >= VAULT.spinUntil) game.shake = Math.max(game.shake, 0.45);
    if (prev < VAULT.boltsUntil && vt >= VAULT.boltsUntil) {
      game.shake = Math.max(game.shake, 0.7);
      for (let k = 0; k < 18; k++) puff(BANK.x + P.vaultDoor.lx + (Math.random() - 0.5) * 6, 0.5 + Math.random() * 4, BANK.z + P.vaultWall.lz0 - 1, 0, 5);
    }
  });
  return (
    <group position={[P.vaultDoor.lx, 0, P.vaultWall.lz0 - 0.5]}>
      <group ref={hinge} position={[R, P.vaultDoor.y, 0]}>
        <mesh position-x={-R} rotation-x={Math.PI / 2} castShadow raycast={noRaycast} material={steel}>
          <cylinderGeometry args={[R, R, 1, 56]} />
        </mesh>
        {[0.78, 0.45].map((k) => (
          <mesh key={k} position={[-R, 0, -0.52]} material={shiny} raycast={noRaycast}>
            <torusGeometry args={[R * k, 0.12, 10, 48]} />
          </mesh>
        ))}
        <group ref={wheel} position={[-R, 0, -0.85]}>
          <mesh material={brass} raycast={noRaycast}>
            <torusGeometry args={[1.3, 0.13, 10, 32]} />
          </mesh>
          {[0, 1, 2].map((k) => (
            <mesh key={k} rotation-z={(k / 3) * Math.PI} material={brass} raycast={noRaycast}>
              <boxGeometry args={[2.6, 0.18, 0.18]} />
            </mesh>
          ))}
          <mesh rotation-x={Math.PI / 2} material={brass} raycast={noRaycast}>
            <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
          </mesh>
        </group>
        {Array.from({ length: BOLTS }, (_, i) => (
          <mesh
            key={i}
            ref={(m) => {
              bolts.current[i] = m;
            }}
            rotation-z={(i / BOLTS) * Math.PI * 2 - Math.PI / 2}
            material={shiny}
            raycast={noRaycast}
          >
            <cylinderGeometry args={[0.22, 0.22, 0.9, 10]} />
          </mesh>
        ))}
        {[-1, 1].map((k) => (
          <mesh key={k} position={[0, k * R * 0.6, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.38, 0.38, 1.4, 12]} />
            <meshStandardMaterial color="#6f7b87" metalness={0.8} roughness={0.35} />
          </mesh>
        ))}
        {/* The drill, clamped to the door while it works */}
        <group ref={drill} position={[-R + 1.2, 0.8, -1.4]} visible={false}>
          <mesh raycast={noRaycast}>
            <boxGeometry args={[1.4, 1, 1.4]} />
            <meshStandardMaterial color="#ff7a2a" roughness={0.5} />
          </mesh>
          <mesh ref={bit} position={[-0.8, 0, 0.6]} rotation-x={Math.PI / 2} raycast={noRaycast}>
            <coneGeometry args={[0.25, 1.1, 8]} />
            <meshStandardMaterial color="#c9d1d9" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0.2, -1.4, 0]} raycast={noRaycast}>
            <boxGeometry args={[0.2, 2, 0.2]} />
            <meshStandardMaterial color="#1b1d21" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** How far through the drill is: a big ring of light on the wall over the door. */
function DrillProgress() {
  const ring = useRef<THREE.Mesh>(null);
  const geo = useRef<THREE.RingGeometry | null>(null);
  const shown = useRef(-1);
  useFrame(() => {
    const m = ring.current;
    if (!m) return;
    const k = drilling() ? clamp01(bank.drill / DRILL_TIME) : 0;
    m.visible = k > 0;
    const step = Math.round(k * 60);
    if (step !== shown.current) {
      shown.current = step;
      geo.current?.dispose();
      geo.current = new THREE.RingGeometry(P.vaultDoor.radius + 0.9, P.vaultDoor.radius + 1.15, 48, 1, Math.PI / 2, -Math.max(0.01, (step / 60) * Math.PI * 2));
      m.geometry = geo.current;
    }
  });
  useEffect(() => () => geo.current?.dispose(), []);
  return (
    <mesh ref={ring} position={[P.vaultDoor.lx, P.vaultDoor.y, P.vaultWall.lz0 - 0.2]} rotation-y={Math.PI} visible={false} raycast={noRaycast}>
      <ringGeometry args={[1, 1.1, 8]} />
      <meshBasicMaterial color="#ffcc00" toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function VaultGlow() {
  const m = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const vt = vaultTime();
    const k = vt < 0 ? 0 : clamp01((vt - VAULT.boltsUntil) / 1.2);
    if (m.current) {
      m.current.opacity = k * (0.2 + Math.sin(clock.elapsedTime * 3) * 0.04);
      m.current.visible = k > 0.01;
    }
  });
  return (
    <mesh position={[P.vaultDoor.lx, P.vaultDoor.y, P.vaultWall.lz0 - 3.5]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
      <cylinderGeometry args={[P.vaultDoor.radius, P.vaultDoor.radius * 1.8, 7, 32, 1, true]} />
      <meshBasicMaterial ref={m} color="#ffd56a" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

/** The vault's two floor lasers, sweeping front to back while there's loot left (jump them). */
function VaultLasers() {
  const beams = useRef<(THREE.Group | null)[]>([]);
  const V = P.vault;
  useFrame(() => {
    const on = vaultLasersOn();
    vaultLasers(game.now).forEach((b, i) => {
      const g = beams.current[i];
      if (!g) return;
      g.visible = on;
      g.position.set(0, b.y, b.lz);
    });
  });
  const width = V.lx1 - V.lx0 - 2;
  return (
    <group>
      {[0, 1].map((i) => (
        <group
          key={i}
          ref={(g) => {
            beams.current[i] = g;
          }}
          visible={false}
        >
          <Beam length={width} along="x" />
        </group>
      ))}
    </group>
  );
}

/** A laser beam (a thin red core in a soft glow), `length` long along x or z. */
function Beam({ length, along }: { length: number; along: "x" | "z" }) {
  const s = (k: number): [number, number, number] => (along === "x" ? [length, k, k] : [k, k, length]);
  return (
    <group>
      <mesh geometry={UNIT} scale={s(0.05)} raycast={noRaycast}>
        <meshBasicMaterial color="#ff2a1a" toneMapped={false} />
      </mesh>
      <mesh geometry={UNIT} scale={s(0.24)} raycast={noRaycast}>
        <meshBasicMaterial color="#ff2a1a" transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The corridor's laser gates (blinking walls of beams) and the low beam sweeping along it. */
function CorridorLasers() {
  const C = P.corridor;
  const gates = useRef<(THREE.Group | null)[]>([]);
  const sweep = useRef<THREE.Group>(null);
  useFrame(() => {
    P.gates.forEach((_, i) => {
      const g = gates.current[i];
      if (g) g.visible = gateOn(i, game.now);
    });
    const b = sweepBeam(game.now);
    sweep.current?.position.set(b.lx, b.y, (C.lz0 + C.lz1) / 2);
  });
  const width = C.lz1 - C.lz0 - T;
  return (
    <group>
      {P.gates.map((gx, i) => (
        <group
          key={gx}
          ref={(g) => {
            gates.current[i] = g;
          }}
          position={[gx, 0, (C.lz0 + T + C.lz1) / 2]}
        >
          {[0.5, 1.3, 2.1, 2.9, 3.7].map((y) => (
            <group key={y} position-y={y}>
              <Beam length={width} along="z" />
            </group>
          ))}
        </group>
      ))}
      <group ref={sweep}>
        <group rotation-y={0}>
          <Beam length={width} along="z" />
        </group>
      </group>
    </group>
  );
}

/** A pile of loot in the vault: stacked gold bars, a pallet of cash, or a rack of deposit boxes. */
function Loot({ loot }: { loot: BankLoot }) {
  const ref = useTakenAnim(loot.id);
  const cash = useMemo(() => signTexture("$100", { bg: "#4f8f3f", fg: "#e9f7dc", height: 64 }), []);
  const gold = mat("#f2c23a", 0.3, 0.55, "#5a3c00");
  return (
    <group position={[loot.lx, 0.16, loot.lz]}>
      <group ref={ref}>
        {loot.kind === "gold" && (
          <group>
            <Block x0={-1.7} x1={1.7} y0={0} y1={0.3} z0={-1.3} z1={1.3} m={mat("#8a5a35", 0.8)} />
            {[4, 3, 2, 1].flatMap((n, y) =>
              Array.from({ length: n }, (_, i) =>
                [-0.6, 0, 0.6].map((z) => (
                  <mesh key={`${y}-${i}-${z}`} position={[(i - (n - 1) / 2) * 0.82, 0.55 + y * 0.42, z]} material={gold} raycast={noRaycast}>
                    <boxGeometry args={[0.76, 0.4, 0.55]} />
                  </mesh>
                )),
              ),
            )}
          </group>
        )}
        {loot.kind === "cash" && (
          <group>
            <Block x0={-1.6} x1={1.6} y0={0} y1={0.5} z0={-1.2} z1={1.2} m={mat("#a87a45", 0.85)} />
            {[0, 1, 2, 3].flatMap((y) =>
              [-0.75, 0.75].flatMap((x) =>
                [-0.55, 0.55].map((z) => (
                  <group key={`${x}${y}${z}`} position={[x, 0.85 + y * 0.66, z]}>
                    <mesh raycast={noRaycast}>
                      <boxGeometry args={[1.4, 0.64, 1]} />
                      <meshStandardMaterial map={cash.texture} roughness={0.8} />
                    </mesh>
                    <mesh raycast={noRaycast}>
                      <boxGeometry args={[0.3, 0.66, 1.02]} />
                      <meshStandardMaterial color="#f4f4f0" roughness={0.8} />
                    </mesh>
                  </group>
                )),
              ),
            )}
            <mesh position-y={3.5} rotation-x={-Math.PI / 2} raycast={noRaycast}>
              <planeGeometry args={[3.2, 2.4]} />
              <meshStandardMaterial color="#d8f0ff" transparent opacity={0.12} roughness={0} />
            </mesh>
          </group>
        )}
        {loot.kind === "boxes" && (
          <group>
            <Block x0={-1.6} x1={1.6} y0={0} y1={4.4} z0={-1} z1={1} m={mat("#8f99a3", 0.35, 0.8)} />
            {Array.from({ length: 6 }, (_, y) =>
              [-1, 0, 1].map((x) => (
                <Block key={`${x}${y}`} x0={x * 1 - 0.45} x1={x * 1 + 0.45} y0={0.2 + y * 0.7} y1={0.8 + y * 0.7} z0={1} z1={1.08} m={mat((x + y) % 2 ? "#c3cbd3" : "#b0b9c2", 0.3, 0.85)} />
              )),
            )}
          </group>
        )}
      </group>
    </group>
  );
}
