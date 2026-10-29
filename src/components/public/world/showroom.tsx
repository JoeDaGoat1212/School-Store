"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Block, Cyl, Shell, mat, useDrawn } from "./buildings";
import { CarModel, MotorbikeModel, newLook } from "./car-model";
import { Humanoid, newPose, randomLook } from "./humanoid";
import { noRaycast } from "./paint";
import { DEALER_PLAN, REALTOR_PLAN, roomOf } from "./rooms";
import { modelOf } from "./vehicles";
import { DEALERSHIP } from "./world-map";

/*
 * Apex Motors' glass showroom (three of the best cars spinning on
 * turntables under spotlights, the sales desk, the big catalogue screen)
 * and its lot; and Keystone Realty's office next door to Restaurant Row.
 */

const SHOWN = [
  { model: "stradale", color: "#c8102e" },
  { model: "huracano", color: "#7cd31b" },
  { model: "g63", color: "#2b2f36" },
];

function Turntable({ lx, lz, r, model, color, speed }: { lx: number; lz: number; r: number; model: string; color: string; speed: number }) {
  const g = useRef<THREE.Group>(null);
  const look = useMemo(newLook, []);
  const body = modelOf(model).body;
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * speed;
  });
  return (
    <group position={[lx, 0, lz]}>
      <Cyl x={0} y={0.12} z={0} r={r} h={0.24} m={mat("#1b1d21", 0.2, 0.6)} />
      <mesh position-y={0.25} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <ringGeometry args={[r - 0.12, r, 48]} />
        <meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={1.4} />
      </mesh>
      <group ref={g} position-y={0.24}>
        {body === "moto" ? <MotorbikeModel color={color} look={look} /> : <CarModel color={color} look={look} body={body} />}
      </group>
    </group>
  );
}

function Salesperson({ lx, lz, turn, seed }: { lx: number; lz: number; turn: number; seed: number }) {
  const pose = useMemo(newPose, []);
  const look = useMemo(() => randomLook(seed, { outfit: "suit", shirt: "#1f2a44", pants: "#1f2a44", accent: "#c8102e" }), [seed]);
  useFrame(({ clock }) => {
    pose.reach = Math.max(0, Math.sin(clock.elapsedTime * 0.9 + seed)) * 0.4;
  });
  return (
    <group position={[lx, 0, lz]} rotation-y={turn}>
      <Humanoid look={look} pose={pose} />
    </group>
  );
}

const BIKE_LOOK = newLook();

export function Showroom() {
  const room = roomOf("dealer");
  const P = DEALER_PLAN;
  const L = DEALERSHIP.lot;
  const pylon = useDrawn(256, 512, (g) => {
    g.fillStyle = "#0f1115";
    g.fillRect(0, 0, 256, 512);
    g.fillStyle = "#ff3b30";
    g.fillRect(0, 0, 256, 18);
    g.fillRect(0, 494, 256, 18);
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.font = "900 70px sans-serif";
    g.fillText("APEX", 128, 170);
    g.fillStyle = "#ff3b30";
    g.fillText("MOTORS", 128, 250);
    g.fillStyle = "#c9ced4";
    g.font = "700 26px sans-serif";
    g.fillText("NEW · LUXURY", 128, 330);
    g.fillText("SUPERCARS", 128, 366);
    g.fillText("BIKES", 128, 402);
  });
  const screen = useDrawn(512, 320, (g) => {
    const grd = g.createLinearGradient(0, 0, 512, 320);
    grd.addColorStop(0, "#1a1d24");
    grd.addColorStop(1, "#3a0d0b");
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 320);
    g.fillStyle = "#ffffff";
    g.font = "900 44px sans-serif";
    g.fillText("FIND YOUR RIDE", 30, 70);
    g.fillStyle = "#ff3b30";
    g.font = "700 26px sans-serif";
    g.fillText("Tap to browse · Press E", 30, 112);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(30 + (i % 3) * 155, 150 + Math.floor(i / 3) * 80, 140, 66);
    }
  });
  return (
    <>
      <Shell room={room} style={{ wall: "#1b1d21", facade: "panel", trim: "#2b2f36", floor: "#d9dde2", inside: "#f4f5f7", sign: "Apex Motors", signBg: "#0f1115", signFg: "#ff3b30", tallGlass: true }}>
        {P.turntables.map((t, i) => (
          <Turntable key={i} lx={t.lx} lz={t.lz} r={t.r} model={SHOWN[i].model} color={SHOWN[i].color} speed={0.25 + i * 0.07} />
        ))}
        {/* Spotlights over each car */}
        {P.turntables.map((t, i) => (
          <mesh key={i} position={[t.lx, room.height - 0.36, t.lz]} rotation-x={Math.PI / 2} raycast={noRaycast}>
            <circleGeometry args={[1.2, 24]} />
            <meshStandardMaterial color="#ffffff" emissive="#fff4dc" emissiveIntensity={2} />
          </mesh>
        ))}
        {/* The sales desk and the salesperson */}
        <Block x0={P.desk.lx0} x1={P.desk.lx1} y0={0} y1={1.55} z0={P.desk.lz0} z1={P.desk.lz1} m={mat("#0f1115", 0.3, 0.4)} cast />
        <Block x0={P.desk.lx0 - 0.1} x1={P.desk.lx1 + 0.1} y0={1.55} y1={1.65} z0={P.desk.lz0 - 0.1} z1={P.desk.lz1 + 0.2} m={mat("#f4f5f7", 0.2)} />
        <Salesperson lx={13} lz={-27.4} turn={0} seed={12} />
        {/* The catalogue screen */}
        <group position={[P.screen.lx, 0, P.screen.lz]}>
          <Block x0={-0.2} x1={0.2} y0={0} y1={1.6} z0={-0.2} z1={0.2} m={mat("#2b2f36", 0.3, 0.7)} />
          <mesh position={[0, 2.5, 0.05]} raycast={noRaycast}>
            <planeGeometry args={[3, 1.9]} />
            <meshStandardMaterial map={screen} emissive="#ffffff" emissiveMap={screen} emissiveIntensity={0.8} />
          </mesh>
          <Block x0={-1.6} x1={1.6} y0={1.5} y1={3.5} z0={-0.12} z1={0} m={mat("#0f1115", 0.3, 0.5)} />
        </group>
        {/* A bike on a plinth by the window */}
        <group position={[P.halfW - 4, 0, -3.5]}>
          <Block x0={-2.4} x1={2.4} y0={0} y1={0.4} z0={-1.4} z1={1.4} m={mat("#ffffff", 0.3)} />
          <group position-y={0.4} rotation-y={-0.7}>
            <MotorbikeModel color="#13a8a0" look={BIKE_LOOK} />
          </group>
        </group>
      </Shell>
      {/* The lot: parking bays, bunting and the pylon sign */}
      <group>
        {Array.from({ length: 10 }, (_, i) =>
          [0, 1].map((col) => (
            <mesh key={`${i}${col}`} position={[L.x0 + 9 + col * 18 + (col ? 3.2 : -3.2), 0.035, L.z0 + 0.5 + i * 5]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
              <planeGeometry args={[6, 0.16]} />
              <meshBasicMaterial color="#f2f2f2" />
            </mesh>
          )),
        )}
        {[L.x0 + 2, L.x1 - 2].map((x) => (
          <Cyl key={x} x={x} y={3} z={(L.z0 + L.z1) / 2} r={0.12} h={6} m={mat("#c9ced4", 0.3, 0.8)} />
        ))}
        {Array.from({ length: 16 }, (_, i) => (
          <mesh key={i} position={[L.x0 + 2 + ((L.x1 - L.x0 - 4) * (i + 0.5)) / 16, 5.4 - Math.sin(((i + 0.5) / 16) * Math.PI) * 0.8, (L.z0 + L.z1) / 2]} rotation-x={Math.PI} raycast={noRaycast}>
            <coneGeometry args={[0.45, 0.9, 3]} />
            <meshStandardMaterial color={["#ff3b30", "#ffffff", "#1d4f91"][i % 3]} side={THREE.DoubleSide} />
          </mesh>
        ))}
        <group position={[L.x1 + 3, 0, L.z0 - 2]}>
          <Block x0={-0.4} x1={0.4} y0={0} y1={8} z0={-0.4} z1={0.4} m={mat("#2b2f36", 0.4, 0.6)} />
          <mesh position={[0, 11, 0]} raycast={noRaycast}>
            <boxGeometry args={[3.2, 6.4, 0.5]} />
            <meshStandardMaterial map={pylon} emissive="#ffffff" emissiveMap={pylon} emissiveIntensity={0.5} />
          </mesh>
        </group>
      </group>
    </>
  );
}

export function RealtyOffice() {
  const room = roomOf("realtor");
  const P = REALTOR_PLAN;
  const wall = useDrawn(1024, 360, (g) => {
    g.fillStyle = "#f4efe6";
    g.fillRect(0, 0, 1024, 360);
    const colors = ["#cfe3ef", "#f4e3c1", "#dbe8c9", "#e8d1ea", "#f6c9b6", "#c9d9f2"];
    for (let i = 0; i < 6; i++) {
      const x = 20 + i * 168;
      g.fillStyle = "#2b2f36";
      g.fillRect(x, 40, 150, 200);
      g.fillStyle = colors[i];
      g.fillRect(x + 8, 48, 134, 120);
      // A little house in each picture.
      g.fillStyle = "#7a3b2e";
      g.beginPath();
      g.moveTo(x + 30, 120);
      g.lineTo(x + 75, 70);
      g.lineTo(x + 120, 120);
      g.fill();
      g.fillStyle = "#ffffff";
      g.fillRect(x + 40, 120, 70, 44);
      g.fillStyle = "#ffd447";
      g.font = "800 22px sans-serif";
      g.fillText(["$150K", "$389K", "$875K", "$2.9M", "$7.2M", "$20M"][i], x + 14, 210);
    }
    g.fillStyle = "#1f3a5f";
    g.font = "900 46px sans-serif";
    g.fillText("FIND YOUR DREAM HOME", 20, 320);
  });
  return (
    <Shell room={room} style={{ wall: "#e9e3d6", facade: "render", trim: "#1f3a5f", floor: "#b98f64", inside: "#fbf8f2", sign: "Keystone Realty", signBg: "#1f3a5f", signFg: "#ffffff", awning: "#1f3a5f" }}>
      <Block x0={P.desk.lx0} x1={P.desk.lx1} y0={0} y1={1.5} z0={P.desk.lz0} z1={P.desk.lz1} m={mat("#5b3a26", 0.6)} cast />
      <Block x0={P.desk.lx0 - 0.2} x1={P.desk.lx1 + 0.2} y0={1.5} y1={1.6} z0={P.desk.lz0 - 0.2} z1={P.desk.lz1 + 0.3} m={mat("#2b2f36", 0.3, 0.3)} />
      <Block x0={-0.6} x1={0.6} y0={1.6} y1={2.4} z0={P.desk.lz0 + 0.1} z1={P.desk.lz0 + 0.2} m={mat("#1b1d21", 0.3, 0.5)} />
      <Salesperson lx={P.agent.lx} lz={P.agent.lz} turn={0} seed={47} />
      <mesh position={[0, 5, -room.depth + room.wall + 0.05]} raycast={noRaycast}>
        <planeGeometry args={[Math.min(24, room.halfW * 1.7), 8.4]} />
        <meshStandardMaterial map={wall} />
      </mesh>
      {/* Armchairs for clients and a plant */}
      {[-1.6, 1.6].map((x) => (
        <group key={x} position={[x, 0, P.client.lz + 1.2]}>
          <Block x0={-0.7} x1={0.7} y0={0} y1={0.9} z0={-0.7} z1={0.7} m={mat("#c9b48a", 0.9)} />
          <Block x0={-0.7} x1={0.7} y0={0.9} y1={2} z0={0.5} z1={0.75} m={mat("#c9b48a", 0.9)} />
        </group>
      ))}
      <group position={[room.halfW - 2, 0, -2.5]}>
        <Cyl x={0} y={0.5} z={0} r={0.6} h={1} m={mat("#f2f2f2", 0.6)} />
        <mesh position-y={2} raycast={noRaycast}>
          <icosahedronGeometry args={[1.1, 1]} />
          <meshStandardMaterial color="#3f8f3a" roughness={0.9} flatShading />
        </mesh>
      </group>
    </Shell>
  );
}
