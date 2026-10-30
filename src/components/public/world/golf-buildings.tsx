"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Block, Cyl, mat } from "./buildings";
import { surface } from "./detail";
import { Near } from "./near";
import { canvasTexture, fontFamily, noRaycast } from "./paint";
import { Static } from "./static-merge";
import { useGameVersion } from "./game-events";
import { CART_PATH, CLUB, HOLES, RANGE, STANDS, TOWERS, YARD, along, ellipseQ, golfHeight, golfWaters, rng, teeSpot, type Hole, type Stand } from "./golf-course";
import { fmtPar, golf, toPar } from "./golf-state";

/*
 * The buildings and furniture of Firebird Ridge: the clubhouse (with its
 * porte-cochère, terrace and car park), the cart barn and the starter's hut,
 * the driving range (covered bays, distance boards, target greens, nets and
 * floodlights), the grandstands (with spectators, and a leaderboard over
 * the 9th), the green-and-gold clock towers (telling the real time), the
 * wooden bridges where the cart path crosses water, and each tee's markers,
 * sign, bench and ball washer.
 */

const GREEN = "#173f2c";
const GOLD = "#c8a24a";
const ROUND = new THREE.SphereGeometry(1, 14, 10);
const gy = (x: number, z: number) => golfHeight(x, z);

/** A flat shape laid over the land (each point lifted to the ground plus `lift`). */
export function drape(geo: THREE.BufferGeometry, x: number, z: number, lift: number) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const wx = p.getX(i) + x;
    const wz = p.getZ(i) + z;
    p.setXYZ(i, wx, golfHeight(wx, wz) + lift, wz);
  }
  geo.computeVertexNormals();
  return geo;
}

function useCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, deps: unknown[] = []) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!);
    return canvasTexture(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** A panel showing a picture (facing +z), lit like everything else. */
function Panel({ tex, w, h, x = 0, y = 0, z = 0, turn = 0, glow = 0 }: { tex: THREE.Texture; w: number; h: number; x?: number; y?: number; z?: number; turn?: number; glow?: number }) {
  return (
    <mesh position={[x, y, z]} rotation-y={turn} raycast={noRaycast}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={0.6} emissiveMap={glow ? tex : null} emissive={glow ? "#ffffff" : "#000000"} emissiveIntensity={glow} />
    </mesh>
  );
}

function HipRoof({ w, d, x, y, z, m, rise }: { w: number; d: number; x: number; y: number; z: number; m: THREE.Material; rise: number }) {
  const geo = useMemo(() => new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4), []);
  return <mesh geometry={geo} material={m} position={[x, y + rise / 2, z]} scale={[w, rise, d]} castShadow receiveShadow raycast={noRaycast} />;
}

// ---- The clubhouse ------------------------------------------------------------------------------------

export function Clubhouse() {
  const H = CLUB.house;
  const stone = surface("stone", "#d9cfbd", 0.85);
  const plinth = surface("stone", "#a99d89", 0.9);
  const wall = surface("stucco", "#efe8da", 0.9);
  const timber = surface("planks", "#7a5338", 0.8);
  const roof = surface("shingle", "#2e4a3c", 0.8);
  const frame = mat("#20262a", 0.4, 0.6);
  const glass = mat("#24323b", 0.06, 0.8);
  const gold = mat(GOLD, 0.35, 0.8);
  const white = mat("#f5f2ea", 0.5);
  const asphalt = mat("#3d4146", 0.95);
  const line = mat("#f2f2ee", 0.6);
  const hedge = mat("#2d5a2a", 0.95);
  const sign = useCanvas(1400, 220, (g) => {
    g.fillStyle = GREEN;
    g.fillRect(0, 0, 1400, 220);
    g.strokeStyle = GOLD;
    g.lineWidth = 8;
    g.strokeRect(14, 14, 1372, 192);
    g.fillStyle = GOLD;
    g.font = `700 92px Georgia, ${fontFamily("display")}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("FIREBIRD RIDGE", 700, 92);
    g.font = `600 44px Georgia, ${fontFamily("body")}`;
    g.fillText("G O L F   ·   C O U N T R Y   C L U B", 700, 168);
  });
  const S1 = 0.8;
  const S2 = 5.2;
  const S3 = 9.6;
  const cx0 = 782;
  const cx1 = 818;
  const winRow = (x0: number, x1: number, y: number, z: number, back: boolean) => {
    const n = Math.floor((x1 - x0) / 4.2);
    return Array.from({ length: n }, (_, i) => x0 + ((i + 0.5) * (x1 - x0)) / n).map((x) => (
      <group key={`${x}${y}${z}`}>
        <Block x0={x - 1.2} x1={x + 1.2} y0={y} y1={y + 2.9} z0={z - 0.08} z1={z + 0.08} m={glass} />
        <Block x0={x - 1.35} x1={x + 1.35} y0={y + 2.9} y1={y + 3.1} z0={z - 0.2} z1={z + 0.2} m={white} />
        <Block x0={x - 1.4} x1={x + 1.4} y0={y - 0.18} y1={y} z0={back ? z - 0.1 : z - 0.35} z1={back ? z + 0.35 : z + 0.1} m={white} />
        <Block x0={x - 0.04} x1={x + 0.04} y0={y} y1={y + 2.9} z0={z - 0.12} z1={z + 0.12} m={frame} />
        <Block x0={x - 1.2} x1={x + 1.2} y0={y + 2.05} y1={y + 2.12} z0={z - 0.12} z1={z + 0.12} m={frame} />
      </group>
    ));
  };
  const stalls: number[] = [];
  for (let x = 734; x < 876; x += 3.2) stalls.push(x);
  return (
    <Near x={800} z={540} dist={900}>
      <Static>
        {/* Car park: asphalt, bay lines, kerbs and planted islands */}
        <Block x0={CLUB.lot.x0} x1={CLUB.lot.x1} y0={0} y1={0.06} z0={CLUB.lot.z0} z1={CLUB.lot.z1} m={asphalt} />
        {stalls
          .filter((x) => x < 790 || x > 810)
          .map((x) => (
            <Block key={`n${x}`} x0={x - 0.06} x1={x + 0.06} y0={0.06} y1={0.08} z0={477} z1={483} m={line} />
          ))}
        {stalls
          .filter((x) => x < 780 || x > 820)
          .map((x) => (
            <Block key={`s${x}`} x0={x - 0.06} x1={x + 0.06} y0={0.06} y1={0.08} z0={497} z1={503} m={line} />
          ))}
        {[745, 765, 835, 855].map((x) => (
          <group key={`is${x}`}>
            <Block x0={x - 4} x1={x + 4} y0={0} y1={0.25} z0={487} z1={493} m={plinth} />
            <Block x0={x - 3.7} x1={x + 3.7} y0={0.25} y1={0.32} z0={487.3} z1={492.7} m={hedge} />
          </group>
        ))}
        {/* The turning circle and its fountain */}
        <Cyl x={800} y={0.3} z={488} r={6} h={0.6} m={plinth} />
        <Cyl x={800} y={0.62} z={488} r={5.4} h={0.05} m={mat("#2f8fb0", 0.05, 0.2)} />
        <Cyl x={800} y={1.4} z={488} r={0.5} h={1.6} m={stone} />
        <Cyl x={800} y={2.3} z={488} r={1.8} h={0.3} m={stone} />
        <Cyl x={800} y={3.0} z={488} r={0.3} h={1.2} m={stone} />
        <mesh geometry={ROUND} material={gold} position={[800, 3.8, 488]} scale={0.4} raycast={noRaycast} />

        {/* The plinth and front steps */}
        <Block x0={H.x0 - 2} x1={H.x1 + 2} y0={0} y1={S1} z0={H.z0 - 2} z1={H.z1 + 1} m={plinth} cast />
        {[0, 1, 2].map((k) => (
          <Block key={`fs${k}`} x0={cx0 + 4} x1={cx1 - 4} y0={0} y1={S1 - k * 0.27} z0={H.z0 - 2 - (k + 1) * 0.6} z1={H.z0 - 2 - k * 0.6} m={plinth} />
        ))}

        {/* Wings: two floors of render over a stone ground floor */}
        {[
          [H.x0, cx0],
          [cx1, H.x1],
        ].map(([x0, x1]) => (
          <group key={`w${x0}`}>
            <Block x0={x0} x1={x1} y0={S1} y1={S2} z0={H.z0} z1={H.z1} m={stone} cast />
            <Block x0={x0} x1={x1} y0={S2} y1={S3} z0={H.z0 + 0.4} z1={H.z1 - 0.4} m={wall} cast />
            <Block x0={x0 - 0.3} x1={x1 + 0.3} y0={S2 - 0.1} y1={S2 + 0.3} z0={H.z0 - 0.3} z1={H.z1 + 0.3} m={white} />
            <Block x0={x0 - 0.5} x1={x1 + 0.5} y0={S3} y1={S3 + 0.5} z0={H.z0 - 0.1} z1={H.z1 + 0.1} m={white} />
            <HipRoof w={x1 - x0 + 2.5} d={H.z1 - H.z0 + 2.5} x={(x0 + x1) / 2} y={S3 + 0.5} z={(H.z0 + H.z1) / 2} m={roof} rise={5} />
            {winRow(x0 + 1, x1 - 1, S1 + 0.6, H.z0 - 0.02, false)}
            {winRow(x0 + 1, x1 - 1, S2 + 0.8, H.z0 + 0.38, false)}
            {winRow(x0 + 1, x1 - 1, S1 + 0.6, H.z1 + 0.02, true)}
            {winRow(x0 + 1, x1 - 1, S2 + 0.8, H.z1 - 0.38, true)}
            {/* Dormers in the roof */}
            {[0.3, 0.7].map((f) => {
              const x = x0 + (x1 - x0) * f;
              return (
                <group key={`d${f}`}>
                  {[H.z0 + 2.2, H.z1 - 2.2].map((z) => (
                    <group key={z}>
                      <Block x0={x - 1.3} x1={x + 1.3} y0={S3 + 0.5} y1={S3 + 2.6} z0={z - 1.2} z1={z + 1.2} m={wall} />
                      <Block x0={x - 0.8} x1={x + 0.8} y0={S3 + 0.9} y1={S3 + 2.3} z0={z < 520 ? z - 1.25 : z + 1.17} z1={z < 520 ? z - 1.17 : z + 1.25} m={glass} />
                      <HipRoof w={3.2} d={3} x={x} y={S3 + 2.6} z={z} m={roof} rise={1.2} />
                    </group>
                  ))}
                </group>
              );
            })}
            {/* Chimneys */}
            <Block x0={(x0 + x1) / 2 - 1} x1={(x0 + x1) / 2 + 1} y0={S3} y1={S3 + 7.5} z0={520} z1={522} m={stone} cast />
          </group>
        ))}

        {/* The great room: a tall glass pavilion between the wings, timber-framed */}
        <Block x0={cx0} x1={cx1} y0={S1} y1={S1 + 0.3} z0={H.z0 - 1} z1={H.z1 + 1} m={plinth} />
        {[H.z0 - 1, H.z1 + 1].map((z) => (
          <group key={`gw${z}`}>
            <Block x0={cx0 + 0.5} x1={cx1 - 0.5} y0={S1 + 0.3} y1={13} z0={z - 0.06} z1={z + 0.06} m={glass} />
            {Array.from({ length: 10 }, (_, i) => cx0 + 0.5 + (i * (cx1 - cx0 - 1)) / 9).map((x) => (
              <Block key={x} x0={x - 0.22} x1={x + 0.22} y0={S1 + 0.3} y1={13} z0={z - 0.25} z1={z + 0.25} m={timber} cast />
            ))}
            <Block x0={cx0} x1={cx1} y0={6.6} y1={6.9} z0={z - 0.25} z1={z + 0.25} m={timber} />
          </group>
        ))}
        {[cx0, cx1].map((x) => (
          <Block key={`gs${x}`} x0={x - 0.5} x1={x + 0.5} y0={S1} y1={13.4} z0={H.z0 - 1.2} z1={H.z1 + 1.2} m={stone} cast />
        ))}
        <Block x0={cx0 - 1} x1={cx1 + 1} y0={13} y1={13.6} z0={H.z0 - 2} z1={H.z1 + 2} m={white} cast />
        <HipRoof w={cx1 - cx0 + 4} d={H.z1 - H.z0 + 6} x={800} y={13.6} z={(H.z0 + H.z1) / 2} m={roof} rise={7} />
        {/* The cupola on top, with a gold weathervane */}
        <group position={[800, 18.6, (H.z0 + H.z1) / 2]}>
          <Block x0={-2} x1={2} y0={0} y1={3.6} z0={-2} z1={2} m={white} cast />
          {[0, 1, 2, 3].map((k) => (
            <group key={k} rotation-y={(k * Math.PI) / 2}>
              <Block x0={-1.2} x1={1.2} y0={0.8} y1={3} z0={2} z1={2.05} m={glass} />
            </group>
          ))}
          <HipRoof w={5} d={5} x={0} y={3.6} z={0} m={mat("#4f7a5c", 0.4, 0.6)} rise={2.6} />
          <Cyl x={0} y={7.2} z={0} r={0.05} h={2.2} m={gold} />
          <Block x0={-0.9} x1={0.9} y0={7.6} y1={7.75} z0={-0.04} z1={0.04} m={gold} />
          <mesh geometry={ROUND} material={gold} position-y={6.4} scale={0.22} raycast={noRaycast} />
        </group>

        {/* The porte-cochère over the front door, with the club's name */}
        <group>
          {[
            [789, 493],
            [811, 493],
            [789, 499],
            [811, 499],
          ].map(([x, z]) => (
            <group key={`pc${x}${z}`}>
              <Block x0={x - 0.8} x1={x + 0.8} y0={0} y1={1} z0={z - 0.8} z1={z + 0.8} m={plinth} />
              <Cyl x={x} y={3.9} z={z} r={0.5} h={5.8} m={stone} />
            </group>
          ))}
          <Block x0={786} x1={814} y0={6.8} y1={7.8} z0={490.5} z1={H.z0} m={white} cast />
          <Block x0={785.6} x1={814.4} y0={7.8} y1={8.1} z0={490.1} z1={H.z0} m={gold} />
          <Block x0={786.5} x1={813.5} y0={6.6} y1={6.8} z0={491} z1={H.z0} m={timber} />
        </group>

        {/* The terrace out the back: a covered veranda on columns, then open stone paving */}
        <Block x0={CLUB.terrace.x0} x1={CLUB.terrace.x1} y0={0} y1={S1} z0={H.z1} z1={CLUB.terrace.z1} m={plinth} />
        <Block x0={CLUB.terrace.x0 + 0.3} x1={CLUB.terrace.x1 - 0.3} y0={S1} y1={S1 + 0.04} z0={H.z1} z1={CLUB.terrace.z1 - 0.3} m={surface("stone", "#cbbfa8", 0.9)} />
        {Array.from({ length: 14 }, (_, i) => 760 + i * 6.15).map((x) => (
          <Cyl key={`vc${x}`} x={x} y={S1 + 2.2} z={546} r={0.32} h={4.4} m={white} />
        ))}
        <Block x0={757} x1={843} y0={S1 + 4.4} y1={S1 + 5} z0={H.z1} z1={547} m={white} cast />
        <Block x0={756.6} x1={843.4} y0={S1 + 5} y1={S1 + 5.2} z0={H.z1} z1={547.4} m={gold} />
        {/* A glass balustrade round the edge, and steps down to the course */}
        {[
          [CLUB.terrace.x0 + 0.3, 790],
          [810, CLUB.terrace.x1 - 0.3],
        ].map(([x0, x1]) => (
          <group key={`bal${x0}`}>
            <Block x0={x0} x1={x1} y0={S1} y1={S1 + 1.1} z0={CLUB.terrace.z1 - 0.35} z1={CLUB.terrace.z1 - 0.3} m={glass} />
            <Block x0={x0} x1={x1} y0={S1 + 1.1} y1={S1 + 1.18} z0={CLUB.terrace.z1 - 0.4} z1={CLUB.terrace.z1 - 0.25} m={frame} />
          </group>
        ))}
        {[0, 1, 2].map((k) => (
          <Block key={`ts${k}`} x0={790} x1={810} y0={0} y1={S1 - k * 0.27} z0={CLUB.terrace.z1 + k * 0.6} z1={CLUB.terrace.z1 + (k + 1) * 0.6} m={plinth} />
        ))}
        {/* Hedges and beds round the building */}
        {[
          [H.x0 - 2, 784, 502.4, 503.6],
          [816, H.x1 + 2, 502.4, 503.6],
        ].map(([x0, x1, z0, z1]) => (
          <Block key={`h${x0}`} x0={x0} x1={x1} y0={0} y1={1.1} z0={z0} z1={z1} m={hedge} cast />
        ))}
        {[-1, 1].map((s) => (
          <group key={`tp${s}`}>
            {[0, 1].map((k) => (
              <mesh key={k} geometry={ROUND} material={hedge} position={[800 + s * (9 + k * 4), 1.4 - k * 0.2, 501]} scale={[0.9, 1.3, 0.9]} castShadow raycast={noRaycast} />
            ))}
          </group>
        ))}
        {/* Flagpoles out front */}
        {[792, 800, 808].map((x) => (
          <Cyl key={`fp${x}`} x={x} y={7} z={481.5} r={0.08} h={14} m={white} />
        ))}
      </Static>
      {/* The flags on the poles, the sign, and the terrace furniture (not merged: they've their own pictures) */}
      {[792, 800, 808].map((x, i) => (
        <mesh key={`fl${x}`} position={[x + 1.2, 12.8, 481.5]} raycast={noRaycast}>
          <planeGeometry args={[2.4, 1.5]} />
          <meshStandardMaterial color={["#173f2c", "#c8a24a", "#ffffff"][i]} side={THREE.DoubleSide} roughness={0.8} />
        </mesh>
      ))}
      <Panel tex={sign} w={20} h={3.1} x={800} y={7.3} z={490.4} turn={Math.PI} />
      <Panel tex={sign} w={14} h={2.2} x={800} y={11.6} z={H.z1 + 1.26} />
      <TerraceTables />
      <CartBarn />
      <Starter />
    </Near>
  );
}

function TerraceTables() {
  const wood = surface("planks", "#8a6446", 0.8);
  const linen = mat("#f7f5ef", 0.7);
  const canvas = mat(GREEN, 0.8);
  const metal = mat("#2b2f33", 0.4, 0.6);
  const y = 0.84;
  const tables: { x: number; z: number; umb: boolean }[] = [];
  for (let x = 762; x < 840; x += 7) tables.push({ x, z: 541, umb: false });
  for (const x of [752, 845]) for (const z of [540, 545]) tables.push({ x, z, umb: true });
  return (
    <Static>
      {tables.map((t, i) => (
        <group key={i} position={[t.x, y, t.z]}>
          <Cyl x={0} y={0.5} z={0} r={0.06} h={1} m={metal} />
          <Cyl x={0} y={1.02} z={0} r={0.85} h={0.05} m={linen} />
          {[0, 1, 2, 3].map((k) => {
            const a = (k * Math.PI) / 2 + 0.4;
            const cx = Math.sin(a) * 1.25;
            const cz = Math.cos(a) * 1.25;
            return (
              <group key={k} position={[cx, 0, cz]} rotation-y={a}>
                <Block x0={-0.3} x1={0.3} y0={0.55} y1={0.62} z0={-0.3} z1={0.3} m={wood} />
                <Block x0={-0.3} x1={0.3} y0={0.62} y1={1.3} z0={0.26} z1={0.32} m={wood} />
                <Block x0={-0.28} x1={-0.22} y0={0} y1={0.55} z0={-0.28} z1={0.28} m={metal} />
                <Block x0={0.22} x1={0.28} y0={0} y1={0.55} z0={-0.28} z1={0.28} m={metal} />
              </group>
            );
          })}
          {t.umb && (
            <>
              <Cyl x={0} y={1.8} z={0} r={0.05} h={3.6} m={metal} />
              <mesh material={canvas} position-y={3.5} castShadow raycast={noRaycast}>
                <coneGeometry args={[2.3, 0.9, 8, 1, true]} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </Static>
  );
}

function CartBarn() {
  const B = CLUB.barn;
  const wood = surface("planks", "#6f4c33", 0.85);
  const roof = surface("panel", "#2e5a43", 0.5, 0.4);
  const dark = mat("#1d2023", 0.9);
  const white = mat("#f3efe6", 0.6);
  const sign = useCanvas(512, 96, (g) => {
    g.fillStyle = GREEN;
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = GOLD;
    g.font = `700 54px Georgia, ${fontFamily("display")}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("GOLF CARTS", 256, 52);
  });
  const ridge = 8.5;
  const eave = 5.2;
  const d = B.z1 - B.z0;
  return (
    <group>
      <Static>
        <Block x0={B.x0} x1={B.x1} y0={0} y1={eave} z0={B.z0} z1={B.z0 + 0.4} m={wood} cast />
        {[B.x0, B.x1 - 0.4].map((x) => (
          <Block key={x} x0={x} x1={x + 0.4} y0={0} y1={eave} z0={B.z0} z1={B.z1} m={wood} cast />
        ))}
        <Block x0={B.x0 + 0.4} x1={B.x1 - 0.4} y0={0} y1={eave - 0.2} z0={B.z0 + 0.4} z1={B.z0 + 0.5} m={dark} />
        {Array.from({ length: 6 }, (_, i) => B.x0 + 0.2 + (i * (B.x1 - B.x0 - 0.4)) / 5).map((x) => (
          <Block key={`p${x}`} x0={x - 0.25} x1={x + 0.25} y0={0} y1={eave} z0={B.z1 - 0.5} z1={B.z1} m={white} cast />
        ))}
        <Block x0={B.x0} x1={B.x1} y0={eave - 0.6} y1={eave} z0={B.z1 - 0.5} z1={B.z1} m={white} />
        {/* A gable roof (ridge along x) */}
        {[-1, 1].map((s) => {
          const run = d / 2 + 1;
          const len = Math.hypot(run, ridge - eave);
          return (
            <mesh
              key={`r${s}`}
              position={[(B.x0 + B.x1) / 2, (ridge + eave) / 2, (B.z0 + B.z1) / 2 + (s * run) / 2]}
              rotation-x={s * Math.atan2(ridge - eave, run)}
              material={roof}
              castShadow
              raycast={noRaycast}
            >
              <boxGeometry args={[B.x1 - B.x0 + 2, 0.2, len]} />
            </mesh>
          );
        })}
        {/* Gable ends */}
        {[B.x0, B.x1 - 0.3].map((x) => (
          <mesh key={`g${x}`} position={[x + 0.15, eave, (B.z0 + B.z1) / 2]} rotation-y={Math.PI / 2} material={wood} raycast={noRaycast}>
            <shapeGeometry args={[new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, ridge - eave)])]} />
          </mesh>
        ))}
      </Static>
      <Panel tex={sign} w={8} h={1.5} x={(B.x0 + B.x1) / 2} y={eave + 0.9} z={B.z1 + 0.05} />
    </group>
  );
}

function Starter() {
  const s = CLUB.starter;
  const wood = surface("planks", "#7d593c", 0.85);
  const roof = surface("shingle", "#2e4a3c", 0.8);
  const white = mat("#f3efe6", 0.6);
  const glass = mat("#24323b", 0.06, 0.8);
  const sign = useCanvas(512, 160, (g) => {
    g.fillStyle = GREEN;
    g.fillRect(0, 0, 512, 160);
    g.strokeStyle = GOLD;
    g.lineWidth = 5;
    g.strokeRect(8, 8, 496, 144);
    g.fillStyle = GOLD;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `700 60px Georgia, ${fontFamily("display")}`;
    g.fillText("STARTER", 256, 62);
    g.font = `500 32px ${fontFamily("body")}`;
    g.fillStyle = "#ffffff";
    g.fillText("Rounds start here · 1st tee →", 256, 120);
  });
  const y = gy(s.x, s.z);
  return (
    <group position={[s.x, y, s.z]}>
      <Static>
        <Block x0={-2.5} x1={2.5} y0={0} y1={0.3} z0={-2.5} z1={2.5} m={surface("stone", "#b9ad97", 0.9)} />
        <Block x0={-2.2} x1={2.2} y0={0.3} y1={3.6} z0={-2.2} z1={2.2} m={wood} cast />
        <Block x0={-1.6} x1={1.6} y0={1.5} y1={3} z0={2.2} z1={2.26} m={glass} />
        <Block x0={-1.8} x1={1.8} y0={1.3} y1={1.45} z0={2.2} z1={2.7} m={white} />
        <Block x0={-2.4} x1={2.4} y0={3.6} y1={3.8} z0={-2.4} z1={2.4} m={white} />
        <HipRoof w={6.2} d={6.2} x={0} y={3.8} z={0} m={roof} rise={2.2} />
        {/* A bench and a rack of clubs */}
        <Block x0={3.3} x1={6.3} y0={0.5} y1={0.62} z0={-0.4} z1={0.4} m={wood} />
        <Block x0={3.4} x1={3.6} y0={0} y1={0.5} z0={-0.3} z1={0.3} m={white} />
        <Block x0={6} x1={6.2} y0={0} y1={0.5} z0={-0.3} z1={0.3} m={white} />
      </Static>
      <Panel tex={sign} w={3.8} h={1.2} y={4.4} z={2.5} />
    </group>
  );
}

// ---- The driving range -----------------------------------------------------------------------------

export function DrivingRange() {
  const R = RANGE;
  const steel = mat("#2c3136", 0.4, 0.7);
  const roof = surface("panel", "#2e5a43", 0.5, 0.4);
  const wood = surface("planks", "#8a6446", 0.8);
  const white = mat("#f3efe6", 0.6);
  const frosted = mat("#c9d6da", 0.2, 0.1);
  const matTurf = mat("#2f6b2a", 0.95);
  const rubber = mat("#1b1b1b", 0.9);
  const lamp = mat("#fffbe8", 0.3, 0, "#fff3c4");
  const netTex = useCanvas(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(20,20,20,0.85)";
    g.lineWidth = 2;
    for (let i = 0; i <= 64; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.moveTo(0, i);
      g.lineTo(64, i);
      g.stroke();
    }
  });
  const sideLen = R.endZ + 32 - R.teeZ;
  const nets = useMemo(() => {
    const mk = (u: number, v: number) => {
      const t = netTex.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(u, v);
      t.needsUpdate = true;
      return t;
    };
    return { side: mk(sideLen / 1.5, 26 / 1.5), end: mk((R.x1 - R.x0 + 8) / 1.5, 30 / 1.5) };
  }, [netTex, sideLen, R.x0, R.x1]);
  const header = useCanvas(1200, 160, (g) => {
    g.fillStyle = GREEN;
    g.fillRect(0, 0, 1200, 160);
    g.fillStyle = GOLD;
    g.font = `700 92px Georgia, ${fontFamily("display")}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("DRIVING RANGE", 600, 86);
  });
  const roofY = 6.2;
  const z0 = R.teeZ - 14;
  const z1 = R.teeZ + 4.5;
  const posts: number[] = [];
  for (let i = 0; i <= R.mats.length; i++) posts.push(R.mats[0].x - 6.5 + i * 13);
  const sideX = [R.x0 - 4, R.x1 + 4];
  const netZ: number[] = [];
  for (let z = R.teeZ - 10; z <= R.endZ + 18; z += 30) netZ.push(z);
  return (
    <Near x={(R.x0 + R.x1) / 2} z={(R.teeZ + R.endZ) / 2} dist={900}>
      <Static>
        {/* The covered bays: a back wall, posts, and a long sloping roof */}
        <Block x0={R.x0 - 6} x1={R.x1 + 6} y0={2.8} y1={roofY - 0.4} z0={z0 - 0.5} z1={z0} m={wood} cast />
        {posts.map((x) => (
          <group key={x}>
            <Block x0={x - 0.2} x1={x + 0.2} y0={0} y1={roofY} z0={z1 - 0.4} z1={z1} m={steel} cast />
            <Block x0={x - 0.2} x1={x + 0.2} y0={0} y1={roofY} z0={z0} z1={z0 + 0.4} m={steel} />
            {/* Frosted dividers between the bays */}
            <Block x0={x - 0.04} x1={x + 0.04} y0={0.1} y1={2.6} z0={z0 + 4} z1={z1 - 1} m={frosted} />
          </group>
        ))}
        <mesh position={[(R.x0 + R.x1) / 2, roofY + 0.55, (z0 + z1) / 2]} rotation-x={0.07} material={roof} castShadow receiveShadow raycast={noRaycast}>
          <boxGeometry args={[R.x1 - R.x0 + 14, 0.25, z1 - z0 + 3]} />
        </mesh>
        <Block x0={R.x0 - 7} x1={R.x1 + 7} y0={roofY - 0.2} y1={roofY + 0.4} z0={z1 - 0.2} z1={z1 + 1.4} m={white} />
        {/* Each bay: a mat, a rubber tee, a bucket of balls and a bench */}
        {R.mats.map((m, i) => (
          <group key={`bay${i}`} position={[m.x, gy(m.x, m.z), m.z]}>
            <Block x0={-2.2} x1={2.2} y0={0} y1={0.04} z0={-1.6} z1={1.6} m={matTurf} />
            <Cyl x={0} y={0.05} z={0} r={0.05} h={0.06} m={rubber} />
            <Cyl x={2.4} y={0.3} z={-1.6} r={0.35} h={0.6} m={mat(["#d63b2f", "#2f6fd6", "#f2b632"][i % 3], 0.5)} />
            <Block x0={-4.5} x1={-1.5} y0={0.45} y1={0.55} z0={-9} z1={-8.4} m={wood} />
            <Block x0={-4.4} x1={-4.2} y0={0} y1={0.45} z0={-8.9} z1={-8.5} m={steel} />
            <Block x0={-1.8} x1={-1.6} y0={0} y1={0.45} z0={-8.9} z1={-8.5} m={steel} />
          </group>
        ))}
        {/* Nets down both sides and across the far end */}
        {sideX.map((x) =>
          netZ.map((z) => <Cyl key={`np${x}${z}`} x={x} y={13} z={z} r={0.22} h={26} m={steel} />),
        )}
        {[R.x0 - 4, R.x0 + 30, R.x0 + 65, R.x1 - 30, R.x1 + 4].map((x) => (
          <Cyl key={`ep${x}`} x={x} y={15} z={R.endZ + 22} r={0.25} h={30} m={steel} />
        ))}
        {/* Floodlights */}
        {[R.x0 - 9, R.x1 + 9].flatMap((x) =>
          [R.teeZ + 30, R.teeZ + 170].map((z) => (
            <group key={`fl${x}${z}`} position={[x, 0, z]}>
              <Cyl x={0} y={14} z={0} r={0.35} h={28} m={steel} />
              <Block x0={-2.6} x1={2.6} y0={27.4} y1={29.6} z0={-0.5} z1={0.2} m={steel} />
              {[-1.8, -0.6, 0.6, 1.8].flatMap((lx) =>
                [27.9, 29.1].map((ly) => (
                  <group key={`${lx}${ly}`} rotation-y={x < R.x0 ? Math.PI / 2 : -Math.PI / 2}>
                    <Block x0={lx - 0.45} x1={lx + 0.45} y0={ly - 0.4} y1={ly + 0.4} z0={0.2} z1={0.32} m={lamp} />
                  </group>
                )),
              )}
            </group>
          )),
        )}
      </Static>
      {/* The nets themselves (see-through mesh) */}
      {sideX.map((x) => (
        <mesh key={`n${x}`} position={[x, 13, (R.teeZ - 10 + R.endZ + 22) / 2]} rotation-y={Math.PI / 2} raycast={noRaycast}>
          <planeGeometry args={[sideLen, 26]} />
          <meshBasicMaterial map={nets.side} transparent alphaTest={0.3} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[(R.x0 + R.x1) / 2, 15, R.endZ + 22]} raycast={noRaycast}>
        <planeGeometry args={[R.x1 - R.x0 + 8, 30]} />
        <meshBasicMaterial map={nets.end} transparent alphaTest={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Panel tex={header} w={30} h={4} x={(R.x0 + R.x1) / 2} y={roofY + 0.1} z={z1 + 1.45} turn={Math.PI} />
      <Panel tex={header} w={30} h={4} x={(R.x0 + R.x1) / 2} y={roofY - 2.2} z={z0 - 0.55} turn={Math.PI} />
      <RangeTargets />
      <DistanceBoards />
    </Near>
  );
}

function DistanceBoards() {
  const R = RANGE;
  const cx = (R.x0 + R.x1) / 2;
  const boards = useMemo(
    () =>
      R.markers.map((yd) => {
        const c = document.createElement("canvas");
        c.width = 512;
        c.height = 320;
        const g = c.getContext("2d")!;
        g.fillStyle = GREEN;
        g.fillRect(0, 0, 512, 320);
        g.strokeStyle = GOLD;
        g.lineWidth = 12;
        g.strokeRect(10, 10, 492, 300);
        g.fillStyle = "#ffffff";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `800 190px ${fontFamily("display")}`;
        g.fillText(String(yd), 256, 150);
        g.fillStyle = GOLD;
        g.font = `700 46px ${fontFamily("body")}`;
        g.fillText("YARDS", 256, 270);
        return { yd, tex: canvasTexture(c) };
      }),
    [R.markers],
  );
  const steel = mat("#2c3136", 0.4, 0.7);
  const colors = ["#e5322d", "#ffffff", "#2f6fd6", "#f2b632", "#111111", "#9b59d0"];
  return (
    <group>
      {boards.map(({ yd, tex }, i) => {
        const z = R.teeZ + yd * YARD;
        return (
          <group key={yd}>
            {/* A big board each side, raised on posts so you can read it from the tee */}
            {[R.x0 + 8, R.x1 - 8].map((x) => {
              const y = gy(x, z);
              return (
                <group key={x} position={[x, y, z]}>
                  <Cyl x={-3} y={3} z={0.2} r={0.14} h={6} m={steel} />
                  <Cyl x={3} y={3} z={0.2} r={0.14} h={6} m={steel} />
                  <Panel tex={tex} w={8} h={5} y={6.2} turn={Math.PI} />
                  <mesh position={[0, 6.2, 0.03]} raycast={noRaycast}>
                    <boxGeometry args={[8.3, 5.3, 0.05]} />
                    <meshStandardMaterial color={GOLD} roughness={0.4} metalness={0.7} />
                  </mesh>
                </group>
              );
            })}
            {/* And a row of coloured yardage flags across the middle */}
            {[-40, 0, 40].map((dx) => {
              const x = cx + dx;
              const y = gy(x, z);
              return (
                <group key={dx} position={[x, y, z]}>
                  <Cyl x={0} y={1.6} z={0} r={0.04} h={3.2} m={mat("#f4f2ea", 0.5)} />
                  <mesh position={[0.5, 2.9, 0]} raycast={noRaycast}>
                    <planeGeometry args={[1, 0.6]} />
                    <meshStandardMaterial color={colors[i % colors.length]} side={THREE.DoubleSide} />
                  </mesh>
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

function RangeTargets() {
  const R = RANGE;
  const cx = (R.x0 + R.x1) / 2;
  const targets = useMemo(
    () =>
      R.targets.map(([yd, off], i) => {
        const x = cx + off;
        const z = R.teeZ + yd * YARD;
        const green = drape(new THREE.CircleGeometry(9 + i * 1.2, 48).rotateX(-Math.PI / 2), x, z, 0.04);
        const rings = [0.33, 0.66, 1].map((f) => drape(new THREE.RingGeometry((9 + i * 1.2) * f - 0.25, (9 + i * 1.2) * f, 64).rotateX(-Math.PI / 2), x, z, 0.07));
        return { x, z, green, rings, color: ["#e5322d", "#f2b632", "#2f6fd6", "#9b59d0", "#ffffff"][i % 5] };
      }),
    [R.targets, R.teeZ, cx],
  );
  const greenM = mat("#4f9a38", 0.85);
  const ringM = mat("#f4f4ef", 0.6);
  return (
    <group>
      {targets.map((t, i) => (
        <group key={i}>
          <mesh geometry={t.green} material={greenM} receiveShadow raycast={noRaycast} />
          {t.rings.map((r, k) => (
            <mesh key={k} geometry={r} material={ringM} raycast={noRaycast} />
          ))}
          <group position={[t.x, gy(t.x, t.z), t.z]}>
            <Cyl x={0} y={2} z={0} r={0.05} h={4} m={mat("#f4f2ea", 0.5)} />
            <mesh position={[0.6, 3.6, 0]} raycast={noRaycast}>
              <planeGeometry args={[1.2, 0.8]} />
              <meshStandardMaterial color={t.color} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

// ---- Grandstands ------------------------------------------------------------------------------------

const SEAT = new THREE.BoxGeometry(0.5, 0.12, 0.45);
const SEAT_BACK = new THREE.BoxGeometry(0.5, 0.55, 0.08);
const BODY = new THREE.CapsuleGeometry(0.26, 0.55, 4, 8);
const HEAD = new THREE.SphereGeometry(0.17, 10, 8);

export function Grandstands() {
  return (
    <group>
      {STANDS.map((s, i) => (
        <Near key={i} x={s.x} z={s.z} dist={760}>
          <Grandstand stand={s} index={i} />
        </Near>
      ))}
      <Scoreboard />
    </group>
  );
}

function Grandstand({ stand, index }: { stand: Stand; index: number }) {
  const { w, rows } = stand;
  const step = 0.75;
  const deep = 1.6;
  const concrete = surface("concrete", "#bfbcb4", 0.9);
  const panel = surface("panel", GREEN, 0.6, 0.2);
  const steel = mat("#2c3136", 0.4, 0.7);
  const white = mat("#f3efe6", 0.6);
  const roofM = surface("panel", "#e9e7e0", 0.5, 0.3);
  const banner = useCanvas(1024, 160, (g) => {
    g.fillStyle = GREEN;
    g.fillRect(0, 0, 1024, 160);
    g.fillStyle = GOLD;
    g.font = `700 84px Georgia, ${fontFamily("display")}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("FIREBIRD RIDGE", 512, 84);
  });
  const top = 0.6 + (rows - 1) * step;
  const backZ = 1 - (rows - 1) * deep - deep / 2;
  const aisleEvery = 14;
  // Seats: one per half-metre-ish, leaving aisles.
  const seats = useMemo(() => {
    const out: { x: number; y: number; z: number; c: string; full: boolean; shirt: string; skin: string }[] = [];
    const r = rng(index * 97 + 5);
    const per = Math.floor((w - 1) / 0.62);
    const shirts = ["#d63b2f", "#2f6fd6", "#f2b632", "#ffffff", "#1f2a33", "#7fbf5a", "#e98fb0", "#ff9a3c", "#3b3f8a"];
    const skins = ["#f1c7a5", "#d9a47c", "#a8714c", "#7a4b2e", "#e8b896", "#c48a62"];
    for (let k = 0; k < rows; k++)
      for (let i = 0; i < per; i++) {
        if (i % aisleEvery === aisleEvery - 1) continue;
        const x = -w / 2 + 0.5 + i * 0.62;
        out.push({
          x,
          y: 0.6 + k * step,
          z: 1 - k * deep - 0.1,
          c: (k + Math.floor(i / 4)) % 5 === 0 ? GOLD : k % 2 ? "#1f5b3c" : "#246b46",
          full: r() < 0.62,
          shirt: shirts[Math.floor(r() * shirts.length)],
          skin: skins[Math.floor(r() * skins.length)],
        });
      }
    return out;
  }, [w, rows, index]);
  const people = seats.filter((s) => s.full);
  const seatRef = useRef<THREE.InstancedMesh>(null);
  const backRef = useRef<THREE.InstancedMesh>(null);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const fill = (m: THREE.InstancedMesh | null, list: typeof seats, f: (s: (typeof seats)[number], o: THREE.Object3D) => string) => {
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    list.forEach((s, i) => {
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      const col = f(s, o);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(col));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  };
  const t0 = useRef(-1);
  useFrame((st) => {
    if (t0.current < 0) {
      t0.current = 0;
      fill(seatRef.current, seats, (s, o) => {
        o.position.set(s.x, s.y + 0.42, s.z);
        return s.c;
      });
      fill(backRef.current, seats, (s, o) => {
        o.position.set(s.x, s.y + 0.75, s.z - 0.26);
        return s.c;
      });
      fill(bodyRef.current, people, (s, o) => {
        o.position.set(s.x, s.y + 0.95, s.z - 0.05);
        return s.shirt;
      });
      fill(headRef.current, people, (s, o) => {
        o.position.set(s.x, s.y + 1.62, s.z - 0.02);
        return s.skin;
      });
    }
    // The crowd shifts about a little (heads bob).
    const hm = headRef.current;
    if (hm && hm.visible && Math.floor(st.clock.elapsedTime * 4) !== t0.current) {
      t0.current = Math.floor(st.clock.elapsedTime * 4);
      const o = new THREE.Object3D();
      const t = st.clock.elapsedTime;
      for (let i = 0; i < people.length; i += 7) {
        const s = people[(i + t0.current) % people.length];
        const j = (i + t0.current) % people.length;
        o.position.set(s.x + Math.sin(t + j) * 0.05, s.y + 1.62, s.z - 0.02);
        o.updateMatrix();
        hm.setMatrixAt(j, o.matrix);
      }
      hm.instanceMatrix.needsUpdate = true;
    }
  });
  const y = gy(stand.x, stand.z);
  return (
    <group position={[stand.x, y, stand.z]} rotation-y={stand.turn}>
      <Static>
        {/* The stepped concrete terraces */}
        {Array.from({ length: rows }, (_, k) => (
          <Block key={k} x0={-w / 2} x1={w / 2} y0={0} y1={0.6 + k * step} z0={1 - k * deep - deep / 2} z1={1 - k * deep + deep / 2} m={concrete} cast={k === rows - 1} />
        ))}
        <Block x0={-w / 2} x1={w / 2} y0={0} y1={0.3} z0={1.8} z1={3} m={concrete} />
        {/* Front rail */}
        <Block x0={-w / 2} x1={w / 2} y0={0.3} y1={1.3} z0={2.2} z1={2.3} m={panel} />
        <Block x0={-w / 2} x1={w / 2} y0={1.3} y1={1.38} z0={2.15} z1={2.35} m={steel} />
        {/* Aisle steps with rails */}
        {Array.from({ length: Math.floor((w - 1) / 0.62 / aisleEvery) }, (_, a) => -w / 2 + 0.5 + (a * aisleEvery + aisleEvery - 1) * 0.62).map((x) => (
          <group key={`a${x}`}>
            {Array.from({ length: rows }, (_, k) => (
              <Block key={k} x0={x - 0.35} x1={x + 0.35} y0={0.6 + k * step} y1={0.6 + k * step + step / 2} z0={1 - k * deep + 0.1} z1={1 - k * deep + deep / 2} m={white} />
            ))}
            <mesh position={[x + 0.4, (0.6 + top) / 2 + 1, 1 - ((rows - 1) * deep) / 2]} rotation-x={Math.atan2(step, deep)} material={steel} raycast={noRaycast}>
              <boxGeometry args={[0.05, 0.05, Math.hypot((rows - 1) * deep, (rows - 1) * step)]} />
            </mesh>
          </group>
        ))}
        {/* Side walls, the back wall and its steel frame */}
        {[-1, 1].map((s) => (
          <Block key={`sw${s}`} x0={s < 0 ? -w / 2 - 0.4 : w / 2} x1={s < 0 ? -w / 2 : w / 2 + 0.4} y0={0} y1={top + 1.2} z0={backZ} z1={2.3} m={panel} cast />
        ))}
        <Block x0={-w / 2 - 0.4} x1={w / 2 + 0.4} y0={0} y1={top + 2.2} z0={backZ - 0.4} z1={backZ} m={panel} cast />
        {Array.from({ length: Math.ceil(w / 6) + 1 }, (_, i) => -w / 2 + (i * w) / Math.ceil(w / 6)).map((x) => (
          <Block key={`bf${x}`} x0={x - 0.18} x1={x + 0.18} y0={0} y1={top + 2.2} z0={backZ - 0.8} z1={backZ - 0.4} m={steel} />
        ))}
        {/* A cantilevered roof on the big stands */}
        {rows >= 8 && (
          <group>
            {Array.from({ length: Math.ceil(w / 8) + 1 }, (_, i) => -w / 2 + (i * w) / Math.ceil(w / 8)).map((x) => (
              <group key={`rp${x}`}>
                <Block x0={x - 0.25} x1={x + 0.25} y0={top + 2.2} y1={top + 7} z0={backZ - 0.8} z1={backZ - 0.3} m={steel} />
                <mesh position={[x, top + 6.4, backZ + (-1 - backZ) / 2]} rotation-x={-0.09} material={steel} raycast={noRaycast}>
                  <boxGeometry args={[0.3, 0.5, -1 - backZ + 1.5]} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, top + 6.85, backZ + (-1 - backZ) / 2]} rotation-x={-0.09} material={roofM} castShadow receiveShadow raycast={noRaycast}>
              <boxGeometry args={[w + 2, 0.2, -1 - backZ + 2]} />
            </mesh>
          </group>
        )}
      </Static>
      <instancedMesh ref={seatRef} args={[SEAT, undefined, seats.length]} raycast={noRaycast}>
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={backRef} args={[SEAT_BACK, undefined, seats.length]} raycast={noRaycast}>
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={bodyRef} args={[BODY, undefined, people.length]} castShadow raycast={noRaycast}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[HEAD, undefined, people.length]} raycast={noRaycast}>
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      {/* The club's name on the back, facing out */}
      <Panel tex={banner} w={Math.min(w - 4, 26)} h={Math.min(w - 4, 26) * 0.156} y={top * 0.6} z={backZ - 0.85} turn={Math.PI} />
      <Panel tex={banner} w={Math.min(w - 4, 18)} h={Math.min(w - 4, 18) * 0.156} y={0.8} z={2.32} />
    </group>
  );
}

/** A big leaderboard behind the 9th green: the best rounds (and, while you're out, your score). */
function Scoreboard() {
  useGameVersion();
  const stand = STANDS[2];
  const key = `${golf.board.map((b) => `${b.name}${b.total}`).join("|")}|${golf.mode}|${golf.hole}|${toPar()}`;
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 768;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0e2a1d";
    g.fillRect(0, 0, 1024, 768);
    g.strokeStyle = GOLD;
    g.lineWidth = 14;
    g.strokeRect(10, 10, 1004, 748);
    g.fillStyle = GOLD;
    g.font = `700 74px Georgia, ${fontFamily("display")}`;
    g.textAlign = "center";
    g.fillText("LEADERBOARD", 512, 96);
    g.fillStyle = "#ffffff";
    g.font = `500 30px ${fontFamily("body")}`;
    g.fillText("Firebird Ridge · 9 holes · Par 37", 512, 142);
    g.fillStyle = GOLD;
    g.fillRect(60, 166, 904, 4);
    const rows = golf.board.slice(0, 8);
    g.textAlign = "left";
    g.font = `700 44px ${fontFamily("body")}`;
    if (!rows.length) {
      g.fillStyle = "#cfe8d6";
      g.textAlign = "center";
      g.fillText("No rounds yet — finish nine", 512, 360);
      g.fillText("holes to get your name up here.", 512, 420);
    }
    rows.forEach((r, i) => {
      const y = 228 + i * 62;
      g.fillStyle = r.you ? GOLD : "#ffffff";
      g.textAlign = "left";
      g.fillText(`${i + 1}`, 80, y);
      g.fillText(r.name.slice(0, 18).toUpperCase(), 150, y);
      g.textAlign = "right";
      g.fillStyle = r.toPar < 0 ? "#ff6b5b" : r.you ? GOLD : "#ffffff";
      g.fillText(fmtPar(r.toPar), 820, y);
      g.fillStyle = "#cfe8d6";
      g.fillText(String(r.total), 950, y);
    });
    if (golf.mode === "round") {
      g.fillStyle = "#1c4a33";
      g.fillRect(40, 690, 944, 56);
      g.fillStyle = GOLD;
      g.textAlign = "center";
      g.font = `700 36px ${fontFamily("body")}`;
      const thru = golf.scores.filter((s) => s != null).length;
      g.fillText(`ON THE COURSE: YOU  ${fmtPar(toPar())}  THRU ${thru}`, 512, 730);
    }
    return canvasTexture(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!stand) return null;
  const x = stand.x + Math.cos(stand.turn) * (stand.w / 2 + 9);
  const z = stand.z - Math.sin(stand.turn) * (stand.w / 2 + 9);
  const y = gy(x, z);
  const steel = mat("#2c3136", 0.4, 0.7);
  return (
    <group position={[x, y, z]} rotation-y={stand.turn}>
      <Cyl x={-5} y={6} z={-0.6} r={0.3} h={12} m={steel} />
      <Cyl x={5} y={6} z={-0.6} r={0.3} h={12} m={steel} />
      <mesh position={[0, 12, -0.4]} raycast={noRaycast}>
        <boxGeometry args={[14.4, 11, 0.6]} />
        <meshStandardMaterial color={GREEN} roughness={0.5} />
      </mesh>
      <Panel tex={tex} w={13.6} h={10.2} y={12} z={-0.08} glow={0.35} />
      <mesh position={[0, 18, -0.4]} raycast={noRaycast}>
        <boxGeometry args={[14.6, 0.6, 1]} />
        <meshStandardMaterial color={GOLD} roughness={0.35} metalness={0.8} />
      </mesh>
    </group>
  );
}

// ---- Clock towers ---------------------------------------------------------------------------------

/** The green-and-gold clock towers round the course (with the real time on all four faces). */
export function ClockTowers() {
  const dial = useCanvas(512, 512, (g) => {
    g.fillStyle = "#fbf8ef";
    g.beginPath();
    g.arc(256, 256, 250, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = GOLD;
    g.lineWidth = 14;
    g.stroke();
    g.fillStyle = "#1f2a24";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const big = i % 5 === 0;
      g.save();
      g.translate(256, 256);
      g.rotate(a);
      g.fillRect(-(big ? 7 : 2), -228, big ? 14 : 4, big ? 44 : 16);
      g.restore();
    }
    g.fillStyle = GREEN;
    g.font = `700 30px Georgia, ${fontFamily("display")}`;
    g.textAlign = "center";
    g.fillText("FIREBIRD RIDGE", 256, 170);
    g.font = `500 22px Georgia, ${fontFamily("body")}`;
    g.fillText("EST. 2026", 256, 356);
  });
  const hands = useRef<THREE.Group[]>([]);
  useFrame(() => {
    const d = new Date();
    const m = d.getMinutes() + d.getSeconds() / 60;
    const h = (d.getHours() % 12) + m / 60;
    hands.current.forEach((g) => {
      if (!g) return;
      const [hour, minute, second] = g.children;
      hour.rotation.z = -(h / 12) * Math.PI * 2;
      minute.rotation.z = -(m / 60) * Math.PI * 2;
      if (second) second.rotation.z = -(d.getSeconds() / 60) * Math.PI * 2;
    });
  });
  const green = surface("panel", "#11452f", 0.5, 0.3);
  const stone = surface("stone", "#cfc6b4", 0.85);
  const gold = mat(GOLD, 0.3, 0.85);
  const dark = mat("#1a1f1c", 0.4, 0.5);
  const roof = mat("#14513a", 0.35, 0.5);
  return (
    <group>
      {TOWERS.map((t, i) => {
        const y = gy(t.x, t.z);
        return (
          <Near key={i} x={t.x} z={t.z} dist={800}>
            <group position={[t.x, y, t.z]} rotation-y={t.turn}>
              <Static>
                <Block x0={-2.6} x1={2.6} y0={0} y1={0.6} z0={-2.6} z1={2.6} m={stone} />
                <Block x0={-2} x1={2} y0={0.6} y1={1.6} z0={-2} z1={2} m={stone} cast />
                <Block x0={-1.3} x1={1.3} y0={1.6} y1={10} z0={-1.3} z1={1.3} m={green} cast />
                {[3.5, 6.5, 9.6].map((by) => (
                  <Block key={by} x0={-1.42} x1={1.42} y0={by} y1={by + 0.22} z0={-1.42} z1={1.42} m={gold} />
                ))}
                {/* Fluted corners */}
                {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} x={sx * 1.3} y={5.8} z={sz * 1.3} r={0.16} h={8.4} m={gold} />))}
                {/* The clock head */}
                <Block x0={-2.1} x1={2.1} y0={10} y1={14.4} z0={-2.1} z1={2.1} m={green} cast />
                <Block x0={-2.3} x1={2.3} y0={9.8} y1={10.1} z0={-2.3} z1={2.3} m={gold} />
                <Block x0={-2.35} x1={2.35} y0={14.3} y1={14.7} z0={-2.35} z1={2.35} m={gold} />
                <HipRoof w={5} d={5} x={0} y={14.7} z={0} m={roof} rise={3.2} />
                <mesh geometry={ROUND} material={gold} position-y={18.1} scale={0.35} raycast={noRaycast} />
                <Cyl x={0} y={19.1} z={0} r={0.06} h={1.8} m={gold} />
              </Static>
              {[0, 1, 2, 3].map((k) => (
                <group key={k} rotation-y={(k * Math.PI) / 2}>
                  <group position={[0, 12.2, 2.12]}>
                    <mesh raycast={noRaycast}>
                      <circleGeometry args={[1.7, 48]} />
                      <meshStandardMaterial map={dial} roughness={0.4} emissive="#fff6dc" emissiveMap={dial} emissiveIntensity={0.15} />
                    </mesh>
                    <mesh raycast={noRaycast}>
                      <torusGeometry args={[1.74, 0.09, 8, 48]} />
                      <meshStandardMaterial color={GOLD} roughness={0.3} metalness={0.85} />
                    </mesh>
                    <group
                      position-z={0.05}
                      ref={(g) => {
                        if (g) hands.current[i * 4 + k] = g;
                      }}
                    >
                      <group>
                        <mesh position-y={0.42} material={dark} raycast={noRaycast}>
                          <boxGeometry args={[0.12, 0.95, 0.04]} />
                        </mesh>
                      </group>
                      <group>
                        <mesh position-y={0.62} material={dark} raycast={noRaycast}>
                          <boxGeometry args={[0.07, 1.35, 0.04]} />
                        </mesh>
                      </group>
                      <group>
                        <mesh position-y={0.6} material={gold} raycast={noRaycast}>
                          <boxGeometry args={[0.025, 1.4, 0.03]} />
                        </mesh>
                      </group>
                    </group>
                    <mesh position-z={0.09} material={gold} raycast={noRaycast}>
                      <cylinderGeometry args={[0.1, 0.1, 0.04, 12]} />
                    </mesh>
                  </group>
                </group>
              ))}
            </group>
          </Near>
        );
      })}
    </group>
  );
}

// ---- Bridges ----------------------------------------------------------------------------------------

export function Bridges() {
  const spans = useMemo(() => {
    const waters = golfWaters();
    const out: { x: number; z: number; turn: number; len: number; y: number }[] = [];
    for (let i = 0; i < CART_PATH.length - 1; i++) {
      const a = CART_PATH[i];
      const b = CART_PATH[i + 1];
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const w = waters.find((wt) => ellipseQ(mx, mz, wt) < 1.12 || ellipseQ(a.x, a.z, wt) < 1.05 || ellipseQ(b.x, b.z, wt) < 1.05);
      if (!w) continue;
      out.push({ x: mx, z: mz, turn: Math.atan2(b.x - a.x, b.z - a.z), len: Math.hypot(b.x - a.x, b.z - a.z) + 0.4, y: w.level + 0.62 });
    }
    return out;
  }, []);
  const deck = surface("planks", "#8a6446", 0.85);
  const rail = surface("planks", "#6a4a32", 0.85);
  const pile = surface("bark", "#4e3b2c", 0.95);
  return (
    <Static>
      {spans.map((s, i) => (
        <group key={i} position={[s.x, s.y, s.z]} rotation-y={s.turn}>
          <Block x0={-2.1} x1={2.1} y0={-0.2} y1={0} z0={-s.len / 2} z1={s.len / 2} m={deck} cast />
          {[-1, 1].map((side) => (
            <group key={side}>
              <Block x0={side * 2.05 - 0.08} x1={side * 2.05 + 0.08} y0={0.95} y1={1.1} z0={-s.len / 2} z1={s.len / 2} m={rail} />
              <Block x0={side * 2.05 - 0.07} x1={side * 2.05 + 0.07} y0={0} y1={1.0} z0={-0.07} z1={0.07} m={rail} />
              <Cyl x={side * 2} y={-1.2} z={0} r={0.18} h={2.2} m={pile} />
            </group>
          ))}
        </group>
      ))}
    </Static>
  );
}

// ---- Tees ----------------------------------------------------------------------------------------------

function holeSign(h: Hole) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 640;
  const g = c.getContext("2d")!;
  g.fillStyle = GREEN;
  g.fillRect(0, 0, 512, 640);
  g.strokeStyle = GOLD;
  g.lineWidth = 10;
  g.strokeRect(12, 12, 488, 616);
  g.fillStyle = GOLD;
  g.textAlign = "center";
  g.font = `700 64px Georgia, ${fontFamily("display")}`;
  g.fillText(`HOLE ${h.n}`, 256, 86);
  g.fillStyle = "#ffffff";
  g.font = `italic 500 38px Georgia, ${fontFamily("body")}`;
  g.fillText(h.name, 256, 136);
  g.font = `700 40px ${fontFamily("body")}`;
  g.fillStyle = GOLD;
  g.fillText(`PAR ${h.par}   ·   ${h.yards} YDS`, 256, 190);
  // The hole's map: fairway line, the green, water and bunkers.
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of h.pts) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  const pad = 40;
  // Up the board is the way the hole plays: rotate so the tee's at the bottom.
  const ang = Math.atan2(h.green.x - h.tee.x, h.green.z - h.tee.z);
  const cxw = (x0 + x1) / 2;
  const czw = (z0 + z1) / 2;
  const rot = (x: number, z: number) => {
    const dx = x - cxw;
    const dz = z - czw;
    const c2 = Math.cos(-ang);
    const s2 = Math.sin(-ang);
    return { u: dx * c2 + dz * s2, v: -dx * s2 + dz * c2 };
  };
  const rp = h.pts.map((p) => rot(p.x, p.z));
  const span = Math.max(...rp.map((p) => Math.abs(p.v))) * 2 + pad;
  const scale = 380 / Math.max(span, 1);
  const map = (x: number, z: number) => {
    const { u, v } = rot(x, z);
    return { X: 256 - u * scale, Y: 425 - v * scale };
  };
  for (const w of golfWaters()) {
    const p = map(w.x, w.z);
    if (p.X < 30 || p.X > 482 || p.Y < 220 || p.Y > 620) continue;
    g.fillStyle = "#3d8fb3";
    g.beginPath();
    g.ellipse(p.X, p.Y, w.rx * scale, w.rz * scale, w.turn + ang, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "#7fbf5a";
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = Math.max(10, h.hw * 2 * scale);
  g.beginPath();
  h.pts.forEach((p, i) => {
    const q = map(p.x, p.z);
    if (i) g.lineTo(q.X, q.Y);
    else g.moveTo(q.X, q.Y);
  });
  g.stroke();
  for (const b of h.bunkers) {
    const p = map(b.x, b.z);
    g.fillStyle = "#ead9a8";
    g.beginPath();
    g.ellipse(p.X, p.Y, Math.max(4, b.rx * scale), Math.max(4, b.rz * scale), 0, 0, Math.PI * 2);
    g.fill();
  }
  const gp = map(h.green.x, h.green.z);
  g.fillStyle = "#9be07a";
  g.beginPath();
  g.ellipse(gp.X, gp.Y, Math.max(8, h.green.rx * scale), Math.max(8, h.green.rz * scale), 0, 0, Math.PI * 2);
  g.fill();
  const pp = map(h.pin.x, h.pin.z);
  g.fillStyle = "#e5322d";
  g.fillRect(pp.X - 2, pp.Y - 22, 4, 22);
  g.fillRect(pp.X + 2, pp.Y - 22, 14, 9);
  const tp = map(h.tee.x, h.tee.z);
  g.fillStyle = "#ffffff";
  g.fillRect(tp.X - 8, tp.Y - 5, 16, 10);
  return canvasTexture(c);
}

/** Every tee: its markers, a stone sign with the hole's map, a bench, a ball washer, and the 100/150/200 plates down the fairway. */
export function TeeFurniture() {
  const signs = useMemo(() => HOLES.map(holeSign), []);
  const stone = surface("stone", "#cfc6b4", 0.85);
  const wood = surface("planks", "#7d593c", 0.85);
  const iron = mat("#232628", 0.5, 0.6);
  const washer = mat(GREEN, 0.5, 0.2);
  const markerColors = ["#2f6fd6", "#ffffff", "#c8a24a"];
  const plates = useMemo(() => {
    const out: { geo: THREE.BufferGeometry; c: string }[] = [];
    for (const h of HOLES) {
      if (h.par === 3) continue;
      for (const [yd, c] of [
        [100, "#e5322d"],
        [150, "#ffffff"],
        [200, "#2f6fd6"],
      ] as const) {
        const s = h.length - yd * YARD;
        if (s < 30) continue;
        const p = along(h, s);
        out.push({ geo: drape(new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2), p.x, p.z, 0.05), c });
      }
    }
    return out;
  }, []);
  return (
    <group>
      {HOLES.map((h, i) => {
        const t = teeSpot(h);
        const turn = Math.atan2(h.teeDir.x, h.teeDir.z);
        const ax = Math.cos(turn);
        const az = -Math.sin(turn);
        const y = gy(t.x, t.z);
        const sx = h.tee.x - ax * 10 - h.teeDir.x * 4;
        const sz = h.tee.z - az * 10 - h.teeDir.z * 4;
        return (
          <Near key={i} x={h.tee.x} z={h.tee.z} dist={420}>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[t.x + ax * 3.2 * s, y + 0.18, t.z + az * 3.2 * s]} raycast={noRaycast} geometry={ROUND} scale={0.2}>
                <meshStandardMaterial color={markerColors[i % 3]} roughness={0.35} />
              </mesh>
            ))}
            <group position={[sx, gy(sx, sz), sz]} rotation-y={turn + Math.PI}>
              <Static>
                <Block x0={-1.3} x1={1.3} y0={0} y1={0.5} z0={-0.5} z1={0.5} m={stone} />
                <Block x0={-1.1} x1={1.1} y0={0.5} y1={3.4} z0={-0.3} z1={0.3} m={stone} cast />
                <Block x0={-1.2} x1={1.2} y0={3.4} y1={3.6} z0={-0.4} z1={0.4} m={stone} />
              </Static>
              <Panel tex={signs[i]} w={1.8} h={2.25} y={1.95} z={0.31} />
              <Panel tex={signs[i]} w={1.8} h={2.25} y={1.95} z={-0.31} turn={Math.PI} />
            </group>
            <group position={[sx + ax * 5, gy(sx + ax * 5, sz + az * 5), sz + az * 5]} rotation-y={turn + Math.PI}>
              <Static>
                <Block x0={-1.4} x1={1.4} y0={0.5} y1={0.6} z0={-0.35} z1={0.35} m={wood} />
                <Block x0={-1.4} x1={1.4} y0={0.6} y1={1.2} z0={-0.4} z1={-0.32} m={wood} />
                <Block x0={-1.3} x1={-1.1} y0={0} y1={0.5} z0={-0.3} z1={0.3} m={iron} />
                <Block x0={1.1} x1={1.3} y0={0} y1={0.5} z0={-0.3} z1={0.3} m={iron} />
                {/* Ball washer on its post */}
                <Cyl x={2.4} y={0.6} z={0} r={0.06} h={1.2} m={iron} />
                <Block x0={2.2} x1={2.6} y0={1.2} y1={1.65} z0={-0.15} z1={0.15} m={washer} />
              </Static>
            </group>
          </Near>
        );
      })}
      {plates.map((p, i) => (
        <mesh key={`pl${i}`} geometry={p.geo} raycast={noRaycast}>
          <meshStandardMaterial color={p.c} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}
