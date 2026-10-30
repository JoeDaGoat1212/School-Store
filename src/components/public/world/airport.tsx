"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Block, Cyl, GLASS, Shell, mat, useDrawn } from "./buildings";
import { Humanoid, newPose, randomLook } from "./humanoid";
import { Instances, type Place } from "./town";
import { Static } from "./static-merge";
import { noRaycast, signTexture } from "./paint";
import { TERMINAL_PLAN, addSolid, markOldAirport, roomOf } from "./rooms";
import { TerminalLandmark, useTerminalSwap } from "./asset-models";
import { AIRPORT } from "./world-map";

/*
 * Firebird International: the runway (with its markings and edge lights),
 * the taxiway and the apron, the terminal you can walk through (check-in
 * desks, rows of seats, the departures board, doors out to the planes), the
 * air traffic control tower, a hangar, a parked airliner, a windsock and a
 * fuel truck. The planes and helicopters you can fly are in flight.tsx.
 */

const A = AIRPORT;
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const ORIGIN = { x: 0, z: 0, turn: 0 };
// The tower, the hangar's walls and the airliner are solid.
// (The tower stands aside when the downloaded terminal, with its own tower, has loaded.)
markOldAirport(addSolid(ORIGIN, { lx0: A.tower.x - 4, lx1: A.tower.x + 4, lz0: A.tower.z - 4, lz1: A.tower.z + 4 }, true));
addSolid(ORIGIN, { lx0: A.hangar.x - A.hangar.w / 2, lx1: A.hangar.x + A.hangar.w / 2, lz0: A.hangar.z + A.hangar.d / 2 - 1, lz1: A.hangar.z + A.hangar.d / 2 }, true);
for (const s of [-1, 1]) addSolid(ORIGIN, { lx0: A.hangar.x + s * (A.hangar.w / 2) - 0.6, lx1: A.hangar.x + s * (A.hangar.w / 2) + 0.6, lz0: A.hangar.z - A.hangar.d / 2, lz1: A.hangar.z + A.hangar.d / 2 }, true);
/** The airliner parked at the gate. */
const JET = { x: -880, z: 178, len: 40 };
addSolid(ORIGIN, { lx0: JET.x - 2.6, lx1: JET.x + 2.6, lz0: JET.z - JET.len / 2, lz1: JET.z + JET.len / 2 }, true);

function Paving() {
  const R = A.runway;
  const T = A.taxiway;
  const P = A.apron;
  const asphalt = mat("#3a3d42", 0.95);
  const concrete = mat("#b9b6ae", 0.9);
  const white = mat("#f2f2f2", 0.7);
  const yellow = mat("#ffcf1f", 0.7);
  const number = useMemo(() => signTexture("27", { bg: "transparent", fg: "#f2f2f2", height: 160 }), []);
  const number2 = useMemo(() => signTexture("09", { bg: "transparent", fg: "#f2f2f2", height: 160 }), []);
  const len = R.x1 - R.x0;
  const dashes: Place = (i, o) => {
    o.position.set(R.x0 + 60 + i * 24, 0.06, R.z);
    o.scale.set(12, 1, 0.9);
  };
  const keys: Place = (i, o) => {
    const end = i < 12 ? R.x0 + 8 : R.x1 - 8;
    const k = i % 12;
    o.position.set(end, 0.06, R.z - R.halfW + 3 + k * ((R.halfW * 2 - 6) / 11));
    o.scale.set(14, 1, 1.4);
  };
  const lights: Place = (i, o) => {
    const side = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2);
    o.position.set(R.x0 + 4 + k * 20, 0.35, R.z + side * (R.halfW + 1));
    return k % 8 === 0 ? "#ff3b30" : "#fff2c0";
  };
  const taxiLights: Place = (i, o) => {
    const side = i % 2 ? 1 : -1;
    o.position.set(T.x0 + Math.floor(i / 2) * 18, 0.3, T.z + side * (T.halfW + 0.8));
  };
  const nLights = Math.floor(len / 20) * 2;
  const nTaxi = Math.floor((T.x1 - T.x0) / 18) * 2;
  // Connectors: apron → taxiway (two), taxiway → runway (at both ends and the middle).
  const links = [
    { x: -1020, z0: P.z1, z1: T.z, w: 18 },
    { x: -700, z0: P.z1, z1: T.z, w: 18 },
    { x: T.x0 + 10, z0: T.z, z1: R.z, w: 18 },
    { x: (T.x0 + T.x1) / 2, z0: T.z, z1: R.z, w: 18 },
    { x: T.x1 - 10, z0: T.z, z1: R.z, w: 18 },
  ];
  return (
    <group>
      <mesh position={[(R.x0 + R.x1) / 2, 0.04, R.z]} rotation-x={-Math.PI / 2} receiveShadow material={asphalt} raycast={noRaycast}>
        <planeGeometry args={[len, R.halfW * 2]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(R.x0 + R.x1) / 2, 0.055, R.z + s * (R.halfW - 1)]} rotation-x={-Math.PI / 2} material={white} raycast={noRaycast}>
          <planeGeometry args={[len - 4, 0.5]} />
        </mesh>
      ))}
      <Instances count={Math.floor((len - 120) / 24)} place={dashes}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color="#f2f2f2" />
      </Instances>
      <Instances count={24} place={keys}>
        <boxGeometry args={[1, 0.02, 1]} />
        <meshStandardMaterial color="#f2f2f2" />
      </Instances>
      {[
        { t: number, x: R.x0 + 30, r: -Math.PI / 2 },
        { t: number2, x: R.x1 - 30, r: Math.PI / 2 },
      ].map((n) => (
        <mesh key={n.x} position={[n.x, 0.07, R.z]} rotation={[-Math.PI / 2, 0, n.r]} raycast={noRaycast}>
          <planeGeometry args={[16 * n.t.aspect * 0.5, 16 * 0.5]} />
          <meshBasicMaterial map={n.t.texture} transparent />
        </mesh>
      ))}
      <Instances count={nLights} place={lights}>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#fff2c0" emissiveIntensity={1.6} />
      </Instances>
      {/* The taxiway, its yellow centre line and blue edge lights */}
      <mesh position={[(T.x0 + T.x1) / 2, 0.035, T.z]} rotation-x={-Math.PI / 2} receiveShadow material={asphalt} raycast={noRaycast}>
        <planeGeometry args={[T.x1 - T.x0, T.halfW * 2]} />
      </mesh>
      <mesh position={[(T.x0 + T.x1) / 2, 0.05, T.z]} rotation-x={-Math.PI / 2} material={yellow} raycast={noRaycast}>
        <planeGeometry args={[T.x1 - T.x0, 0.35]} />
      </mesh>
      <Instances count={nTaxi} place={taxiLights}>
        <sphereGeometry args={[0.22, 8, 6]} />
        <meshStandardMaterial color="#3d6fe0" emissive="#3d6fe0" emissiveIntensity={1.4} />
      </Instances>
      {links.map((l, i) => (
        <group key={i}>
          <mesh position={[l.x, 0.036, (l.z0 + l.z1) / 2]} rotation-x={-Math.PI / 2} material={asphalt} raycast={noRaycast}>
            <planeGeometry args={[l.w, Math.abs(l.z1 - l.z0) + 4]} />
          </mesh>
          <mesh position={[l.x, 0.052, (l.z0 + l.z1) / 2]} rotation-x={-Math.PI / 2} material={yellow} raycast={noRaycast}>
            <planeGeometry args={[0.35, Math.abs(l.z1 - l.z0)]} />
          </mesh>
        </group>
      ))}
      {/* The apron, with parking stands */}
      <mesh position={[(P.x0 + P.x1) / 2, 0.033, (P.z0 + P.z1) / 2]} rotation-x={-Math.PI / 2} receiveShadow material={concrete} raycast={noRaycast}>
        <planeGeometry args={[P.x1 - P.x0, P.z1 - P.z0]} />
      </mesh>
      {[-1000, -960, -880, -800, -740].map((x) => (
        <mesh key={x} position={[x, 0.045, (P.z0 + P.z1) / 2]} rotation-x={-Math.PI / 2} material={yellow} raycast={noRaycast}>
          <planeGeometry args={[0.35, P.z1 - P.z0 - 20]} />
        </mesh>
      ))}
      {A.helipads.map((h) => (
        <group key={h.x} position={[h.x, 0.05, h.z]}>
          <mesh rotation-x={-Math.PI / 2} raycast={noRaycast}>
            <circleGeometry args={[9, 32]} />
            <meshStandardMaterial color="#2b2f36" roughness={0.9} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={0.01} raycast={noRaycast}>
            <ringGeometry args={[7.6, 8.2, 32]} />
            <meshStandardMaterial color="#ffcf1f" />
          </mesh>
          {[
            [-2.2, 0, 0.8, 7],
            [2.2, 0, 0.8, 7],
            [0, 0, 3.6, 0.8],
          ].map(([x, z, w, d], i) => (
            <mesh key={i} position={[x, 0.02, z]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial color="#f2f2f2" />
            </mesh>
          ))}
        </group>
      ))}
      {/* The car park */}
      <mesh position={[(A.parking.x0 + A.parking.x1) / 2, 0.034, (A.parking.z0 + A.parking.z1) / 2]} rotation-x={-Math.PI / 2} material={asphalt} raycast={noRaycast}>
        <planeGeometry args={[A.parking.x1 - A.parking.x0, A.parking.z1 - A.parking.z0]} />
      </mesh>
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[A.parking.x0 + 3 + i * 5, 0.05, (A.parking.z0 + A.parking.z1) / 2]} rotation-x={-Math.PI / 2} material={white} raycast={noRaycast}>
          <planeGeometry args={[0.18, A.parking.z1 - A.parking.z0 - 22]} />
        </mesh>
      ))}
    </group>
  );
}

function Tower() {
  const T = A.tower;
  const beacon = useRef<THREE.MeshStandardMaterial>(null);
  const radar = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    if (beacon.current) beacon.current.emissiveIntensity = Math.sin(clock.elapsedTime * 3) > 0.2 ? 3 : 0.2;
    if (radar.current) radar.current.rotation.y += dt * 1.6;
  });
  const concrete = mat("#e9e6df", 0.85);
  return (
    <group position={[T.x, 0, T.z]}>
      <Cyl x={0} y={(T.h - 8) / 2} z={0} r={3.6} h={T.h - 8} m={concrete} />
      {Array.from({ length: 6 }, (_, i) => (
        <Cyl key={i} x={0} y={6 + i * 8} z={0} r={3.75} h={0.3} m={mat("#9aa3ad", 0.6)} />
      ))}
      <Block x0={-6} x1={6} y0={0} y1={5} z0={-6} z1={6} m={concrete} />
      {/* The cab: wide glass all the way round */}
      <Cyl x={0} y={T.h - 7.4} z={0} r={7.4} h={1.2} m={mat("#2b2f36", 0.5, 0.4)} />
      <mesh position-y={T.h - 4.4} raycast={noRaycast}>
        <cylinderGeometry args={[7.6, 6.6, 5, 12, 1, true]} />
        <meshPhysicalMaterial color="#1d5f7a" roughness={0.05} metalness={0.6} transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      <Cyl x={0} y={T.h - 1.6} z={0} r={8} h={0.8} m={mat("#2b2f36", 0.5, 0.4)} />
      <Cyl x={0} y={T.h + 1.5} z={0} r={0.18} h={5} m={mat("#c9ced4", 0.3, 0.8)} />
      <mesh position-y={T.h + 4.2} raycast={noRaycast}>
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshStandardMaterial ref={beacon} color="#ff3b30" emissive="#ff3b30" emissiveIntensity={2} />
      </mesh>
      <group ref={radar} position={[3, T.h - 0.8, 0]}>
        <Block x0={-2.4} x1={2.4} y0={0.3} y1={1.1} z0={-0.1} z1={0.1} m={mat("#f2f2f2", 0.4, 0.4)} />
        <Cyl x={0} y={0.1} z={0} r={0.1} h={0.6} m={mat("#2b2f36", 0.4)} />
      </group>
    </group>
  );
}

function Hangar() {
  const H = A.hangar;
  const sign = useMemo(() => signTexture("Hangar 1", { bg: "#1d4f91", fg: "#ffffff" }).texture, []);
  const shell = useMemo(() => new THREE.CylinderGeometry(H.w / 2, H.w / 2, H.d, 32, 1, true, -Math.PI / 2, Math.PI), [H.w, H.d]);
  return (
    <group position={[H.x, 0, H.z]}>
      <mesh geometry={shell} position-y={0} rotation-x={-Math.PI / 2} scale={[1, 1, H.h / (H.w / 2)]} castShadow receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color="#c9ced4" roughness={0.45} metalness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[H.w, H.d]} />
        <meshStandardMaterial color="#8e9196" roughness={0.6} />
      </mesh>
      {/* The back wall */}
      <mesh position={[0, 0, H.d / 2 - 0.2]} scale-y={H.h / (H.w / 2)} raycast={noRaycast}>
        <circleGeometry args={[H.w / 2, 32, 0, Math.PI]} />
        <meshStandardMaterial color="#9aa3ad" roughness={0.6} metalness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, H.h * 0.82, -H.d / 2 - 0.1]} rotation-y={Math.PI} raycast={noRaycast}>
        <planeGeometry args={[24, 3]} />
        <meshStandardMaterial map={sign} />
      </mesh>
      <Airliner x={0} z={4} scale={0.55} color="#f2f4f7" stripe="#1d4f91" turn={Math.PI} />
    </group>
  );
}

/** A big passenger jet (not flyable: it's waiting at the gate). */
function Airliner({ x, z, turn = 0, scale = 1, color, stripe }: { x: number; z: number; turn?: number; scale?: number; color: string; stripe: string }) {
  const body = mat(color, 0.35, 0.3);
  const s = mat(stripe, 0.4, 0.2);
  const L = JET.len;
  const R = 2.5;
  return (
    <group position={[x, 0, z]} rotation-y={turn} scale={scale}>
      <group position-y={R + 1.6}>
        <mesh rotation-x={Math.PI / 2} material={body} castShadow raycast={noRaycast}>
          <capsuleGeometry args={[R, L - R * 2, 8, 24]} />
        </mesh>
        <mesh position={[0, -R * 0.15, 0]} rotation-x={Math.PI / 2} scale={[1.01, 1, 0.16]} material={s} raycast={noRaycast}>
          <cylinderGeometry args={[R, R, L - R * 2, 24, 1, true]} />
        </mesh>
        {/* Cockpit windows and passenger windows */}
        <mesh position={[0, R * 0.45, -L / 2 + 1.6]} rotation-x={-0.6} raycast={noRaycast}>
          <boxGeometry args={[2.2, 0.5, 0.8]} />
          <meshStandardMaterial color="#1b2a3a" roughness={0.1} metalness={0.7} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (R - 0.02), R * 0.25, 0]} rotation-y={(side * Math.PI) / 2} raycast={noRaycast}>
            <planeGeometry args={[L - 10, 0.35]} />
            <meshStandardMaterial color="#1b2a3a" />
          </mesh>
        ))}
        {/* Wings with engines */}
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 9, -R * 0.55, 2]} rotation-y={side * -0.45} material={body} castShadow raycast={noRaycast}>
              <boxGeometry args={[17, 0.45, 5]} />
            </mesh>
            <group position={[side * 6.5, -R - 0.4, -0.5]}>
              <mesh rotation-x={Math.PI / 2} raycast={noRaycast}>
                <cylinderGeometry args={[1.15, 1.15, 4, 18]} />
                <meshStandardMaterial color="#c9ced4" metalness={0.7} roughness={0.3} />
              </mesh>
              <mesh position-z={-2.02} raycast={noRaycast}>
                <circleGeometry args={[0.95, 18]} />
                <meshStandardMaterial color="#1b1d21" />
              </mesh>
            </group>
          </group>
        ))}
        {/* The tail */}
        <mesh position={[0, R + 2.6, L / 2 - 3]} material={s} castShadow raycast={noRaycast}>
          <boxGeometry args={[0.4, 6, 4.4]} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 3.6, 0.4, L / 2 - 2.4]} rotation-y={side * -0.4} material={body} raycast={noRaycast}>
            <boxGeometry args={[6.4, 0.3, 2.4]} />
          </mesh>
        ))}
      </group>
      {/* Landing gear */}
      {[
        [0, -L / 2 + 4],
        [-2.6, 1.6],
        [2.6, 1.6],
      ].map(([gx, gz], i) => (
        <group key={i} position={[gx, 0, gz]}>
          <Cyl x={0} y={1.1} z={0} r={0.14} h={1.8} m={mat("#9aa3ad", 0.3, 0.8)} />
          <mesh position-y={0.55} rotation-z={Math.PI / 2} raycast={noRaycast}>
            <cylinderGeometry args={[0.55, 0.55, 0.6, 14]} />
            <meshStandardMaterial color="#1b1d21" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Terminal() {
  const room = roomOf("terminal");
  const P = TERMINAL_PLAN;
  const board = useDrawn(1024, 512, (g) => {
    g.fillStyle = "#0b0e14";
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = "#ffcf1f";
    g.font = "900 48px monospace";
    g.fillText("DEPARTURES", 30, 64);
    const rows = [
      ["FB 101", "NEW YORK", "08:15", "ON TIME"],
      ["FB 220", "LONDON", "09:40", "BOARDING"],
      ["FB 315", "TOKYO", "10:05", "ON TIME"],
      ["FB 042", "PARIS", "11:30", "DELAYED"],
      ["FB 777", "SYDNEY", "12:45", "ON TIME"],
      ["FB 508", "MIAMI", "13:10", "GATE 4"],
      ["FB 619", "DUBAI", "14:55", "ON TIME"],
    ];
    g.font = "700 34px monospace";
    rows.forEach((r, i) => {
      const y = 130 + i * 52;
      g.fillStyle = "#ffffff";
      g.fillText(r[0], 30, y);
      g.fillText(r[1], 220, y);
      g.fillText(r[2], 560, y);
      g.fillStyle = r[3] === "DELAYED" ? "#ff5a4f" : r[3] === "BOARDING" ? "#2fbf4a" : "#ffcf1f";
      g.fillText(r[3], 720, y);
    });
  });
  const seat = mat("#1d4f91", 0.6);
  const metal = mat("#9aa3ad", 0.35, 0.7);
  const staffLooks = useMemo(() => P.desks.map((_, i) => randomLook(300 + i, { outfit: "suit", shirt: "#1d4f91", pants: "#1b1d21", accent: "#ffcf1f" })), [P.desks]);
  const travellers = useMemo(() => P.seats.slice(0, 6).map((_, i) => randomLook(500 + i)), [P.seats]);
  const pose = useMemo(newPose, []);
  const sitting = useMemo(() => ({ ...newPose(), sit: 1 }), []);
  return (
    <Shell room={room} style={{ wall: "#dfe5ea", facade: "panel", trim: "#2b2f36", floor: "#e9e6df", inside: "#f7f8f9", sign: "Firebird International", signBg: "#1d4f91", signFg: "#ffffff", tallGlass: true }}>
      {/* A swooping canopy over the drop-off */}
      <Block x0={-room.halfW - 3} x1={room.halfW + 3} y0={room.height + 0.8} y1={room.height + 1.4} z0={-room.depth - 3} z1={9} m={mat("#f2f4f7", 0.4, 0.3)} cast />
      {Array.from({ length: 8 }, (_, i) => (
        <Cyl key={i} x={-room.halfW + 6 + i * ((room.halfW * 2 - 12) / 7)} y={(room.height + 1) / 2} z={8} r={0.35} h={room.height + 1} m={metal} />
      ))}
      {/* Check-in desks, each with an agent */}
      {P.desks.map((d, i) => (
        <group key={i}>
          <Block x0={d.lx0} x1={d.lx1} y0={0} y1={1.5} z0={d.lz0} z1={d.lz1} m={mat("#f2f4f7", 0.35)} cast />
          <Block x0={d.lx0} x1={d.lx1} y0={2.6} y1={3.8} z0={d.lz0 - 0.6} z1={d.lz0 - 0.4} m={mat("#1d4f91", 0.5)} />
          <group position={[(d.lx0 + d.lx1) / 2, 0, d.lz0 - 1.4]}>
            <Humanoid look={staffLooks[i]} pose={pose} castShadow={false} />
          </group>
        </group>
      ))}
      {/* Rows of seats, a few people waiting */}
      {P.seats.map((s, i) => (
        <group key={i} position={[s.lx, 0, s.lz]}>
          <Block x0={-8} x1={8} y0={0.8} y1={1} z0={-0.6} z1={0.6} m={seat} />
          <Block x0={-8} x1={8} y0={1} y1={2} z0={0.45} z1={0.6} m={seat} />
          {[-7, 0, 7].map((x) => (
            <Block key={x} x0={x - 0.1} x1={x + 0.1} y0={0} y1={0.8} z0={-0.2} z1={0.2} m={metal} />
          ))}
          {i < travellers.length && (
            <group position={[-4 + (i % 3) * 3.5, 0, 0]} rotation-y={Math.PI}>
              <Humanoid look={travellers[i]} pose={sitting} castShadow={false} />
            </group>
          )}
        </group>
      ))}
      {/* The departures board */}
      <mesh position={[0, 9, -6]} raycast={noRaycast}>
        <planeGeometry args={[16, 8]} />
        <meshStandardMaterial map={board} emissive="#ffffff" emissiveMap={board} emissiveIntensity={0.9} />
      </mesh>
      <Block x0={-8.2} x1={8.2} y0={4.8} y1={13.2} z0={-6.4} z1={-6.05} m={mat("#1b1d21", 0.4)} />
      {/* The gate doors out to the planes, and a jet bridge */}
      <mesh geometry={UNIT} material={GLASS} position={[0, 2, -room.depth + 0.3]} scale={[P.gateHalf * 2, 4, 0.1]} raycast={noRaycast} />
      <group position={[40, 6.5, -room.depth - 9]}>
        <Block x0={-2} x1={2} y0={-1.6} y1={1.6} z0={-9} z1={9} m={mat("#c9ced4", 0.4, 0.5)} cast />
        <Cyl x={0} y={-4} z={6} r={0.4} h={5} m={metal} />
      </group>
    </Shell>
  );
}

/** Where the old terminal stood (between the road and the apron), once the new one's across the road: paved over, with a crossing to the apron. */
function Forecourt() {
  const T = A.terminal;
  const concrete = mat("#bdb9b0", 0.92);
  const paint = mat("#f2f2f2", 0.7);
  const z0 = 70;
  const z1 = A.apron.z0;
  return (
    <group>
      <mesh position={[T.x, 0.04, (z0 + z1) / 2]} rotation-x={-Math.PI / 2} material={concrete} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[T.w + 40, z1 - z0]} />
      </mesh>
      {/* A zebra crossing over the road, from the terminal to here */}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[T.x - 14 + i * 4, 0.07, 58]} rotation-x={-Math.PI / 2} material={paint} raycast={noRaycast}>
          <planeGeometry args={[2, 16]} />
        </mesh>
      ))}
    </group>
  );
}

function Windsock() {
  const sock = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (sock.current) sock.current.rotation.y = 0.5 + Math.sin(clock.elapsedTime * 0.4) * 0.3;
  });
  return (
    <group position={[-650, 0, 330]}>
      <Cyl x={0} y={4} z={0} r={0.12} h={8} m={mat("#c9ced4", 0.3, 0.8)} />
      <group ref={sock} position-y={7.6}>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} position={[0.5 + i * 0.75, 0, 0]} rotation-z={Math.PI / 2} raycast={noRaycast}>
            <cylinderGeometry args={[0.5 - i * 0.06, 0.56 - i * 0.06, 0.75, 12, 1, true]} />
            <meshStandardMaterial color={i % 2 ? "#ffffff" : "#ff5a1f"} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function FuelTruck() {
  return (
    <group position={[-930, 0, 205]} rotation-y={0.4}>
      <Block x0={-1.3} x1={1.3} y0={0.8} y1={3} z0={-3.8} z1={-1.8} m={mat("#ffcf1f", 0.5)} cast />
      <mesh position={[0, 2.1, 1.2]} rotation-x={Math.PI / 2} raycast={noRaycast}>
        <cylinderGeometry args={[1.2, 1.2, 6, 18]} />
        <meshStandardMaterial color="#e9ecef" metalness={0.6} roughness={0.3} />
      </mesh>
      {[-3, 0, 3].map((z) => (
        <mesh key={z} position={[0, 0.55, z]} rotation-z={Math.PI / 2} raycast={noRaycast}>
          <cylinderGeometry args={[0.55, 0.55, 2.7, 14]} />
          <meshStandardMaterial color="#1b1d21" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export function Airport() {
  // The downloaded terminal (life size, across the road), once it's loaded: it takes the place of the old terminal and control tower.
  const swapped = useTerminalSwap();
  return (
    <group>
      <Paving />
      {swapped ? <Forecourt /> : <Terminal />}
      {!swapped && <Tower />}
      <TerminalLandmark />
      <Static>
        <Hangar />
        <Airliner x={JET.x} z={JET.z} color="#f2f4f7" stripe="#ff5a1f" />
        <FuelTruck />
      </Static>
      <Windsock />
    </group>
  );
}
