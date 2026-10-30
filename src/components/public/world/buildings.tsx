"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { player } from "./bump";
import { drive } from "./drive";
import { Humanoid, newPose, randomLook, type Look } from "./humanoid";
import { jobs, type Customer } from "./jobs";
import { MENUS } from "./menus";
import { canvasTexture, noRaycast, signTexture } from "./paint";
import { roomOf, shopPlan, type Room } from "./rooms";
import { SHOPS, type ShopKey } from "./world-map";
import { toWorld } from "./city-layout";
import { Near } from "./near";
import { Static } from "./static-merge";
import { surface } from "./detail";

/*
 * The walk-in buildings on Restaurant Row (the five places you can work),
 * drawn in each building's own frame (like the bank): a brick or rendered
 * shell with a glass shopfront and sliding doors, a lit sign and awning,
 * and inside the dining area, the order kiosk, the counter with its order
 * screen, the kitchen (each shop's own oven / freezer / espresso machine /
 * grill / flower cooler) and the menu board. Plus the people: customers
 * (with a patience bar over their heads) and the NPC working when you're
 * not. Apex Motors, Keystone Realty and the terminal reuse the shell
 * (dealer.tsx, realty.tsx, airport.tsx).
 */

// ---- Materials (one per colour) ---------------------------------------------------------------

const mats = new Map<string, THREE.Material>();
export function mat(color: string, rough = 0.7, metal = 0, emissive?: string) {
  const k = `${color}|${rough}|${metal}|${emissive ?? ""}`;
  let m = mats.get(k);
  if (!m) mats.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ?? "#000000", emissiveIntensity: emissive ? 1 : 0 })));
  return m;
}
export const GLASS = new THREE.MeshPhysicalMaterial({ color: "#a9d8f0", roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false });
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 20);

/** A box from (x0, y0, z0) to (x1, y1, z1), in the building's frame. */
export function Block({ x0, x1, y0, y1, z0, z1, m, cast = false }: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; m: THREE.Material; cast?: boolean }) {
  return <mesh geometry={BOX} material={m} position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} scale={[x1 - x0, y1 - y0, z1 - z0]} castShadow={cast} receiveShadow raycast={noRaycast} />;
}
export function Cyl({ x, y, z, r, h, m, rz = 0 }: { x: number; y: number; z: number; r: number; h: number; m: THREE.Material; rz?: number }) {
  return <mesh geometry={CYL} material={m} position={[x, y, z]} rotation-z={rz} scale={[r, h, r]} raycast={noRaycast} />;
}

/** A picture drawn once on a canvas. */
export function useDrawn(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, deps: unknown[] = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!);
    return canvasTexture(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ---- The shell ------------------------------------------------------------------------------------

export type ShellStyle = {
  wall: string;
  /** Brick, render or panels on the outside. */
  facade: "brick" | "render" | "panel";
  trim: string;
  floor: string;
  inside: string;
  sign: string;
  signBg: string;
  signFg: string;
  awning?: string;
  /** Glass all the way up (showrooms, the terminal). */
  tallGlass?: boolean;
};

/** The outside walls: real brick (with recessed mortar), render or metal panels (detail.ts). */
function facadeMat(style: ShellStyle) {
  if (style.facade === "brick") return surface("brick", style.wall, 0.92);
  if (style.facade === "panel") return surface("panel", style.wall, 0.35, 0.35);
  return surface("stucco", style.wall, 0.88);
}

/** Sliding glass doors in the middle of a front wall (they open as you walk up). */
export function SlideDoors({ room, height = 3.4 }: { room: Room; height?: number }) {
  const l = useRef<THREE.Group>(null);
  const r = useRef<THREE.Group>(null);
  const at = useMemo(() => toWorld(room.site, 0, 0), [room]);
  const open = useRef(0);
  const half = room.doorHalf;
  useFrame((_, delta) => {
    const x = drive.active ? drive.pos.x : player.x;
    const z = drive.active ? drive.pos.z : player.z;
    let near = Math.hypot(x - at.x, z - at.z) < 6;
    // Customers coming and going open them too.
    const sim = jobs.shops[room.key as ShopKey];
    if (sim) near ||= sim.customers.some((c) => Math.hypot(c.pos.x - at.x, c.pos.z - at.z) < 4);
    open.current = THREE.MathUtils.damp(open.current, near ? 1 : 0, 6, delta);
    if (l.current) l.current.position.x = -half / 2 - open.current * half * 0.92;
    if (r.current) r.current.position.x = half / 2 + open.current * half * 0.92;
  });
  const panel = (
    <>
      <mesh geometry={BOX} material={GLASS} position-y={height / 2} scale={[half - 0.08, height - 0.1, 0.08]} raycast={noRaycast} />
      <mesh geometry={BOX} material={mat("#2b2f36", 0.4, 0.6)} position-y={height - 0.05} scale={[half, 0.1, 0.12]} raycast={noRaycast} />
      <mesh geometry={BOX} material={mat("#2b2f36", 0.4, 0.6)} position-y={0.05} scale={[half, 0.1, 0.12]} raycast={noRaycast} />
      <mesh geometry={BOX} material={mat("#c9ced4", 0.3, 0.8)} position={[0, height / 2, 0.09]} scale={[0.05, 0.9, 0.05]} raycast={noRaycast} />
    </>
  );
  return (
    <group position-z={-0.3}>
      <group ref={l}>{panel}</group>
      <group ref={r}>{panel}</group>
    </group>
  );
}

/** Stone for the trim round every shop: the plinth, the piers and the cornice. */
const stone = (color: string) => surface("stone", color, 0.85);
const BASE = "#7f7b74";
const PIER = "#c9bfac";
const CAP = "#d6cdbb";
/** Dark glass for the side windows (they're shut; the shop's inside is drawn behind its own walls). */
const SIDE_GLASS = new THREE.MeshStandardMaterial({ color: "#1d2630", roughness: 0.08, metalness: 0.8 });

/** Four walls with a glass shopfront, a roof, a sign and an awning. Children go inside (in the building's frame). */
export function Shell({ room, style, children }: { room: Room; style: ShellStyle; children?: ReactNode }) {
  const W = room.halfW;
  const D = room.depth;
  const H = room.height;
  const t = room.wall;
  const outside = facadeMat(style);
  const inside = mat(style.inside, 0.9);
  const trim = mat(style.trim, 0.45, 0.3);
  const doorH = Math.min(4, H - 1.2);
  const glassTop = style.tallGlass ? H - 0.8 : Math.min(H - 2.6, 4.6);
  const sign = useMemo(() => signTexture(style.sign, { bg: style.signBg, fg: style.signFg, height: 128 }), [style.sign, style.signBg, style.signFg]);
  const signH = Math.min(1.9, H * 0.22);
  const signW = Math.min(W * 1.5, signH * sign.aspect);
  const floorTex = useDrawn(
    256,
    256,
    (g) => {
      g.fillStyle = style.floor;
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "rgba(0,0,0,0.12)";
      g.lineWidth = 2;
      for (let i = 0; i <= 256; i += 64) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, 256);
        g.moveTo(0, i);
        g.lineTo(256, i);
        g.stroke();
      }
    },
    [style.floor],
  );
  const floorMat = useMemo(() => {
    const tex = floorTex.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(W / 3, D / 6);
    tex.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 });
  }, [floorTex, W, D]);

  return (
    <group position={[room.site.x, 0, room.site.z]} rotation-y={room.site.turn}>
      <Static>
      {/* Floor and ceiling */}
      <mesh material={floorMat} position={[0, 0.06, -D / 2]} rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[W * 2 - 0.1, D - 0.1]} />
      </mesh>
      <Block x0={-W} x1={W} y0={H - 0.3} y1={H} z0={-D} z1={0} m={inside} />
      {/* Ceiling lights */}
      {Array.from({ length: Math.max(1, Math.floor(W / 5)) }).map((_, i, a) => (
        <mesh key={i} geometry={BOX} material={mat("#ffffff", 0.5, 0, "#fff6e0")} position={[-W + ((i + 0.5) * 2 * W) / a.length, H - 0.34, -D / 2]} scale={[1.6, 0.06, D * 0.6]} raycast={noRaycast} />
      ))}
      {/* Side and back walls: outside face and inside face */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block x0={s < 0 ? -W : W - t * 0.5} x1={s < 0 ? -W + t * 0.5 : W} y0={0} y1={H} z0={-D} z1={0} m={outside} cast />
          <Block x0={s < 0 ? -W + t * 0.5 : W - t} x1={s < 0 ? -W + t : W - t * 0.5} y0={0} y1={H - 0.3} z0={-D + t} z1={-t} m={inside} />
        </group>
      ))}
      <Block x0={-W} x1={W} y0={0} y1={H} z0={-D} z1={-D + t * 0.5} m={outside} cast />
      <Block x0={-W + t} x1={W - t} y0={0} y1={H - 0.3} z0={-D + t * 0.5} z1={-D + t} m={inside} />
      {/* The front: a low wall, big windows, the doors, and the wall above */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block x0={s < 0 ? -W : room.doorHalf} x1={s < 0 ? -room.doorHalf : W} y0={0} y1={0.7} z0={-t} z1={0} m={outside} />
          <mesh geometry={BOX} material={GLASS} position={[(s * (W + room.doorHalf)) / 2, (0.7 + glassTop) / 2, -t / 2]} scale={[W - room.doorHalf, glassTop - 0.7, 0.08]} raycast={noRaycast} />
          {/* Mullions */}
          {Array.from({ length: Math.max(1, Math.round((W - room.doorHalf) / 3.2)) + 1 }).map((_, i, a) => (
            <mesh key={i} geometry={BOX} material={trim} position={[s * (room.doorHalf + ((W - room.doorHalf) * i) / (a.length - 1)), (0.7 + glassTop) / 2, -t / 2]} scale={[0.14, glassTop - 0.7, t + 0.04]} raycast={noRaycast} />
          ))}
        </group>
      ))}
      <Block x0={-W} x1={W} y0={glassTop} y1={H} z0={-t} z1={0} m={outside} cast />
      <Block x0={-room.doorHalf} x1={room.doorHalf} y0={doorH} y1={glassTop} z0={-t} z1={0} m={trim} />
      <Block x0={-W - 0.2} x1={W + 0.2} y0={glassTop - 0.12} y1={glassTop + 0.05} z0={-t - 0.05} z1={0.12} m={trim} />
      {/* Roof with a parapet and some machinery */}
      <Block x0={-W - 0.3} x1={W + 0.3} y0={H} y1={H + 0.8} z0={-D - 0.3} z1={0.3} m={trim} cast />
      {/* ---- The finer details (like the bank) ---- */}
      {/* A stone plinth round the bottom (either side of the doors at the front) */}
      <Block x0={-W - 0.18} x1={-W + 0.2} y0={0} y1={0.9} z0={-D - 0.18} z1={0.18} m={stone(BASE)} />
      <Block x0={W - 0.2} x1={W + 0.18} y0={0} y1={0.9} z0={-D - 0.18} z1={0.18} m={stone(BASE)} />
      <Block x0={-W - 0.18} x1={W + 0.18} y0={0} y1={0.9} z0={-D - 0.18} z1={-D + 0.2} m={stone(BASE)} />
      {[-1, 1].map((s) => (
        <Block key={s} x0={s < 0 ? -W - 0.18 : room.doorHalf + 0.1} x1={s < 0 ? -room.doorHalf - 0.1 : W + 0.18} y0={0} y1={0.75} z0={-0.1} z1={0.18} m={stone(BASE)} />
      ))}
      {/* Stone piers up the front corners, with a capital at the top */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block x0={s < 0 ? -W - 0.4 : W - 1} x1={s < 0 ? -W + 1 : W + 0.4} y0={0} y1={H} z0={-0.7} z1={0.4} m={stone(PIER)} cast />
          <Block x0={s < 0 ? -W - 0.6 : W - 1.2} x1={s < 0 ? -W + 1.2 : W + 0.6} y0={H - 0.9} y1={H - 0.55} z0={-0.8} z1={0.6} m={stone(CAP)} />
        </group>
      ))}
      {/* A cornice: a frieze band, a row of dentils under it, and a projecting lip over the parapet */}
      <Block x0={-W - 0.3} x1={W + 0.3} y0={H - 0.55} y1={H} z0={-0.1} z1={0.35} m={stone(CAP)} />
      {Array.from({ length: Math.floor((W * 2) / 0.9) }, (_, i) => -W + 0.45 + i * 0.9).map((x) => (
        <Block key={x} x0={x - 0.18} x1={x + 0.18} y0={H - 0.85} y1={H - 0.55} z0={-0.05} z1={0.28} m={stone(CAP)} />
      ))}
      <Block x0={-W - 0.65} x1={W + 0.65} y0={H + 0.8} y1={H + 1.1} z0={-D - 0.65} z1={0.65} m={stone(CAP)} cast />
      {/* Tall windows down both sides, each with a stone sill and lintel */}
      {[-1, 1].flatMap((s) =>
        Array.from({ length: Math.max(0, Math.floor((D - 6) / 7)) }, (_, i) => -4 - i * 7).map((z) => (
          <group key={`${s}${z}`} position={[s * (W + 0.03), 0, z]}>
            <Block x0={-0.02} x1={0.02} y0={1.6} y1={Math.min(H - 1.6, 6.2)} z0={-1.3} z1={1.3} m={SIDE_GLASS} />
            <Block x0={-0.08} x1={0.08} y0={1.6} y1={Math.min(H - 1.6, 6.2)} z0={-0.06} z1={0.06} m={trim} />
            <Block x0={-0.25} x1={0.25} y0={1.35} y1={1.6} z0={-1.6} z1={1.6} m={stone(CAP)} />
            <Block x0={-0.15} x1={0.15} y0={Math.min(H - 1.6, 6.2)} y1={Math.min(H - 1.6, 6.2) + 0.45} z0={-1.55} z1={1.55} m={stone(CAP)} />
          </group>
        )),
      )}
      <Block x0={-W * 0.5} x1={-W * 0.5 + 3} y0={H + 0.8} y1={H + 2.2} z0={-D * 0.6} z1={-D * 0.6 + 2.4} m={mat("#9aa3ad", 0.5, 0.6)} />
      {/* The sign */}
      <mesh position={[0, glassTop + (H - glassTop) / 2 + 0.3, 0.16]} raycast={noRaycast}>
        <planeGeometry args={[signW, signH]} />
        <meshStandardMaterial map={sign.texture} emissive="#ffffff" emissiveMap={sign.texture} emissiveIntensity={0.55} roughness={0.5} />
      </mesh>
      {/* The awning */}
      {style.awning && (
        <group position={[0, glassTop - 0.1, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={BOX} position={[(s * (W + room.doorHalf)) / 2, -0.3, 1.1]} rotation-x={0.42} scale={[W - room.doorHalf - 0.4, 0.08, 2.5]} castShadow raycast={noRaycast}>
              <meshStandardMaterial color={style.awning} roughness={0.85} />
            </mesh>
          ))}
        </group>
      )}
      </Static>
      <SlideDoors room={room} height={doorH} />
      {/* Inside: only drawn when you're nearby. */}
      <Near x={room.site.x} z={room.site.z} dist={Math.max(110, room.halfW * 2.5)}>
        {children}
      </Near>
    </group>
  );
}

// ---- Restaurant Row ---------------------------------------------------------------------------

const SHOP_STYLE: Record<ShopKey, ShellStyle> = {
  pizza: { wall: "#9c3b26", facade: "brick", trim: "#1f2a24", floor: "#e8dccb", inside: "#f4ead8", sign: "Slice Society", signBg: "#1f2a24", signFg: "#ffcf5a", awning: "#2f7d3a" },
  icecream: { wall: "#ffd6e5", facade: "render", trim: "#ffffff", floor: "#fff3f8", inside: "#fffafc", sign: "Polar Scoops", signBg: "#5cc8f0", signFg: "#ffffff", awning: "#ff8fb1" },
  coffee: { wall: "#3b2a20", facade: "panel", trim: "#c9a27a", floor: "#c89f74", inside: "#efe4d4", sign: "Bean There", signBg: "#efe4d4", signFg: "#3b2a20", awning: "#6b4329" },
  burger: { wall: "#c8ccd2", facade: "panel", trim: "#e01e37", floor: "#f2f2f2", inside: "#fffdf8", sign: "Smash Stack", signBg: "#e01e37", signFg: "#ffd21f", awning: "#ffd21f" },
  flowers: { wall: "#e8efe4", facade: "render", trim: "#3f6b4f", floor: "#d9c7a8", inside: "#f6f8f2", sign: "Petal & Stem", signBg: "#3f6b4f", signFg: "#f6f8f2", awning: "#f2c4d0" },
};

/** The menu board: the shop's choices and prices. */
function MenuBoard({ shop, w }: { shop: ShopKey; w: number }) {
  const m = MENUS[shop];
  const tex = useDrawn(
    1024,
    420,
    (g) => {
      g.fillStyle = "#1d1f22";
      g.fillRect(0, 0, 1024, 420);
      g.fillStyle = SHOP_STYLE[shop].signFg === "#ffffff" ? "#5cc8f0" : SHOP_STYLE[shop].signFg;
      g.font = "800 54px sans-serif";
      g.fillText(SHOPS[shop].name.toUpperCase(), 40, 70);
      g.font = "600 30px sans-serif";
      const steps = m.steps;
      steps.slice(0, 4).forEach((s, i) => {
        const x = 40 + (i % 2) * 500;
        const y = 130 + Math.floor(i / 2) * 150;
        g.fillStyle = "#ffffff";
        g.fillText(s.label.replace(/ \(.*\)/, "").toUpperCase(), x, y);
        g.fillStyle = "#c9ced4";
        g.font = "500 24px sans-serif";
        g.fillText(
          s.options
            .slice(0, 4)
            .map((o) => o.label)
            .join(" · "),
          x,
          y + 36,
        );
        g.font = "600 30px sans-serif";
      });
      g.fillStyle = "#ffd447";
      g.fillText(`From $${m.base.toFixed(2)}`, 40, 400);
    },
    [shop],
  );
  return (
    <mesh position={[0, 0, 0]} raycast={noRaycast}>
      <planeGeometry args={[w, w * 0.41]} />
      <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.6} />
    </mesh>
  );
}

/** A screen showing some words (the kiosk, the order screen). */
function Screen({ text, bg, w = 0.9, h = 1.3 }: { text: string; bg: string; w?: number; h?: number }) {
  const tex = useDrawn(
    256,
    360,
    (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, 256, 360);
      g.fillStyle = "#ffffff";
      g.font = "800 34px sans-serif";
      g.textAlign = "center";
      text.split("\n").forEach((line, i) => g.fillText(line, 128, 80 + i * 46));
      for (let i = 0; i < 4; i++) {
        g.fillStyle = "rgba(255,255,255,0.25)";
        g.fillRect(30 + (i % 2) * 104, 200 + Math.floor(i / 2) * 70, 92, 56);
      }
    },
    [text, bg],
  );
  return (
    <mesh raycast={noRaycast}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.7} />
    </mesh>
  );
}

function Table({ lx, lz }: { lx: number; lz: number }) {
  const top = mat("#f2efe8", 0.4);
  const metal = mat("#2b2f36", 0.4, 0.7);
  return (
    <group position={[lx, 0, lz]}>
      <Cyl x={0} y={1.42} z={0} r={1.05} h={0.08} m={top} />
      <Cyl x={0} y={0.72} z={0} r={0.08} h={1.4} m={metal} />
      <Cyl x={0} y={0.04} z={0} r={0.5} h={0.06} m={metal} />
      {[0, Math.PI].map((a) => (
        <group key={a} position={[Math.sin(a) * 1.7, 0, Math.cos(a) * 1.7]}>
          <Cyl x={0} y={0.95} z={0} r={0.45} h={0.1} m={mat(SHOP_CHAIR, 0.6)} />
          <Cyl x={0} y={0.48} z={0} r={0.05} h={0.95} m={metal} />
        </group>
      ))}
    </group>
  );
}
const SHOP_CHAIR = "#c0392b";

/** Each shop's big machine at the back left. */
function Machine({ shop, box }: { shop: ShopKey; box: { lx0: number; lx1: number; lz0: number; lz1: number; height: number } }) {
  const cx = (box.lx0 + box.lx1) / 2;
  const cz = (box.lz0 + box.lz1) / 2;
  const w = box.lx1 - box.lx0;
  const d = box.lz1 - box.lz0;
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.emissiveIntensity = 1.2 + Math.sin(clock.elapsedTime * 7) * 0.25 + Math.sin(clock.elapsedTime * 13) * 0.15;
  });
  if (shop === "pizza")
    return (
      <group position={[cx, 0, cz]}>
        {/* A brick wood-fired oven: a dome on a base with a glowing mouth */}
        <Block x0={-w / 2} x1={w / 2} y0={0} y1={1.3} z0={-d / 2} z1={d / 2} m={mat("#7a4a3a", 0.9)} />
        <mesh position-y={1.3} scale={[w / 2, 1.7, d / 2]} castShadow raycast={noRaycast}>
          <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#9c3b26" roughness={0.95} />
        </mesh>
        <mesh position={[0, 1.85, d / 2 - 0.15]} raycast={noRaycast}>
          <circleGeometry args={[0.75, 20, 0, Math.PI]} />
          <meshStandardMaterial ref={glow} color="#ff7a1a" emissive="#ff5a1a" emissiveIntensity={1.3} />
        </mesh>
        <Cyl x={0} y={3.9} z={-0.4} r={0.3} h={2.6} m={mat("#2b2f36", 0.5, 0.6)} />
      </group>
    );
  if (shop === "icecream")
    return (
      <group position={[cx, 0, cz]}>
        {/* A dipping cabinet with tubs of every flavour under glass */}
        <Block x0={-w / 2} x1={w / 2} y0={0} y1={1.5} z0={-d / 2} z1={d / 2} m={mat("#f2f4f7", 0.3, 0.4)} />
        {MENUS.icecream.steps[1].options.map((o, i) => (
          <Block key={o.id} x0={-w / 2 + 0.4 + (i % 4) * ((w - 0.8) / 4)} x1={-w / 2 + 0.4 + (i % 4) * ((w - 0.8) / 4) + (w - 0.8) / 4 - 0.15} y0={1.5} y1={1.62} z0={-d / 2 + 0.6 + Math.floor(i / 4) * 1.6} z1={-d / 2 + 2 + Math.floor(i / 4) * 1.6} m={mat(o.color, 0.8)} />
        ))}
        <mesh geometry={BOX} material={GLASS} position={[0, 1.95, d / 2 - 0.3]} rotation-x={-0.5} scale={[w, 0.9, 0.05]} raycast={noRaycast} />
      </group>
    );
  if (shop === "coffee")
    return (
      <group position={[cx, 0, cz]}>
        <Block x0={-w / 2} x1={w / 2} y0={0} y1={1.45} z0={-d / 2} z1={d / 2} m={mat("#3b2a20", 0.6)} />
        {/* The espresso machine: chrome, with group heads and a steam wand */}
        <Block x0={-1.6} x1={1.6} y0={1.45} y1={2.6} z0={-0.8} z1={0.6} m={mat("#c9ced4", 0.2, 0.9)} />
        <Block x0={-1.6} x1={1.6} y0={2.6} y1={2.7} z0={-0.8} z1={0.6} m={mat("#e01e37", 0.4)} />
        {[-0.8, 0.8].map((x) => (
          <Cyl key={x} x={x} y={2.0} z={0.75} r={0.18} h={0.25} m={mat("#2b2f36", 0.3, 0.8)} />
        ))}
        <Cyl x={1.9} y={2.2} z={0.3} r={0.04} h={1} m={mat("#c9ced4", 0.2, 0.9)} />
        {/* The grinder and beans */}
        <Block x0={-2.3} x1={-1.8} y0={1.45} y1={2.4} z0={-0.4} z1={0.2} m={mat("#1b1d21", 0.4, 0.5)} />
        <mesh position={[-2.05, 2.7, -0.1]} raycast={noRaycast}>
          <coneGeometry args={[0.32, 0.6, 16]} />
          <meshStandardMaterial color="#5a3420" transparent opacity={0.8} />
        </mesh>
      </group>
    );
  if (shop === "burger")
    return (
      <group position={[cx, 0, cz]}>
        {/* A flat-top grill under a steel hood */}
        <Block x0={-w / 2} x1={w / 2} y0={0} y1={1.4} z0={-d / 2} z1={d / 2} m={mat("#9aa3ad", 0.35, 0.8)} />
        <Block x0={-w / 2 + 0.2} x1={w / 2 - 0.2} y0={1.4} y1={1.48} z0={-d / 2 + 0.2} z1={d / 2 - 0.2} m={mat("#1b1d21", 0.3, 0.7)} />
        {[-1, 0, 1].map((i) => (
          <Cyl key={i} x={i * 1.2} y={1.53} z={0.2} r={0.42} h={0.1} m={mat("#6b3a22", 0.9)} />
        ))}
        <Block x0={-w / 2} x1={w / 2} y0={3.4} y1={4.2} z0={-d / 2} z1={d / 2 + 0.4} m={mat("#c9ced4", 0.25, 0.9)} />
        <mesh position={[0, 1.65, 0]} raycast={noRaycast}>
          <planeGeometry args={[w * 0.8, 0.5]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.07} />
        </mesh>
      </group>
    );
  return (
    <group position={[cx, 0, cz]}>
      {/* A glass flower cooler full of buckets */}
      <Block x0={-w / 2} x1={w / 2} y0={0} y1={0.4} z0={-d / 2} z1={d / 2} m={mat("#3f6b4f", 0.6)} />
      <mesh geometry={BOX} material={GLASS} position={[0, 1.9, 0]} scale={[w, 3, d]} raycast={noRaycast} />
      {MENUS.flowers.steps[0].options.map((o, i) => (
        <group key={o.id} position={[-w / 2 + 0.6 + (i % 4) * ((w - 1.2) / 3), 0.4 + Math.floor(i / 4) * 1.4, -d / 4 + (i % 2) * 0.8]}>
          <Cyl x={0} y={0.3} z={0} r={0.32} h={0.6} m={mat("#c9ced4", 0.3, 0.8)} />
          {Array.from({ length: 6 }, (_, k) => (
            <mesh key={k} position={[Math.cos(k) * 0.18, 0.95 + (k % 2) * 0.12, Math.sin(k) * 0.18]} raycast={noRaycast}>
              <sphereGeometry args={[0.16, 8, 6]} />
              <meshStandardMaterial color={o.color} roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Food sitting on the counter / prep table, so the kitchen looks busy. */
function Props({ shop, P }: { shop: ShopKey; P: ReturnType<typeof shopPlan> }) {
  const y = P.prep.height;
  const z = (P.prep.lz0 + P.prep.lz1) / 2;
  if (shop === "pizza")
    return (
      <group>
        <Cyl x={-1.6} y={y + 0.05} z={z} r={0.9} h={0.08} m={mat("#f3d9a4", 0.9)} />
        <Cyl x={-1.6} y={y + 0.1} z={z} r={0.78} h={0.03} m={mat("#c8321e", 0.8)} />
        {[0, 1, 2].map((i) => (
          <Cyl key={i} x={1 + i * 0.75} y={y + 0.18} z={z} r={0.28} h={0.3} m={mat(["#b3261e", "#c8b59a", "#3f9b3a"][i], 0.8)} />
        ))}
        {/* Pizza boxes stacked on the counter */}
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} x0={P.counter.lx1 - 2.4} x1={P.counter.lx1 - 0.4} y0={P.counter.height + i * 0.22} y1={P.counter.height + 0.2 + i * 0.22} z0={P.counter.lz0 + 0.1} z1={P.counter.lz1 - 0.1} m={mat("#e8d2a8", 0.9)} />
        ))}
      </group>
    );
  if (shop === "flowers")
    return (
      <group>
        {[-2.4, -0.8, 0.8, 2.4].map((x, i) => (
          <group key={x} position={[x, y, z]}>
            <Cyl x={0} y={0.4} z={0} r={0.25} h={0.8} m={GLASS} />
            {Array.from({ length: 5 }, (_, k) => (
              <mesh key={k} position={[Math.cos(k * 1.3) * 0.2, 1.05 + (k % 2) * 0.15, Math.sin(k * 1.3) * 0.2]} raycast={noRaycast}>
                <sphereGeometry args={[0.15, 8, 6]} />
                <meshStandardMaterial color={MENUS.flowers.steps[0].options[(i * 2 + k) % 7].color} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    );
  return (
    <group>
      {[-2, 0, 2].map((x, i) => (
        <Cyl key={x} x={x} y={y + 0.3} z={z} r={0.26} h={0.6} m={mat(["#ffffff", "#e8d2a8", "#ff8fb1"][i], 0.6)} />
      ))}
    </group>
  );
}

function Shop({ shop }: { shop: ShopKey }) {
  const room = roomOf(shop);
  const P = shopPlan(shop);
  const style = SHOP_STYLE[shop];
  const c = P.counter;
  const counterFront = mat(style.trim, 0.5, 0.2);
  const top = mat("#f4f1ea", 0.25, 0.1);
  return (
    <Shell room={room} style={style}>
      {/* The counter */}
      <Block x0={c.lx0} x1={c.lx1} y0={0} y1={c.height - 0.08} z0={c.lz0} z1={c.lz1} m={counterFront} cast />
      <Block x0={c.lx0 - 0.1} x1={c.lx1 + 0.1} y0={c.height - 0.08} y1={c.height} z0={c.lz0 - 0.1} z1={c.lz1 + 0.15} m={top} />
      {/* The order screen (staff side) */}
      <group position={[P.pos.lx, c.height + 0.55, (c.lz0 + c.lz1) / 2]} rotation-y={Math.PI}>
        <Screen text={"ORDERS\n▶ NEW"} bg="#1d4f91" w={0.8} h={0.55} />
      </group>
      <Block x0={P.pos.lx - 0.06} x1={P.pos.lx + 0.06} y0={c.height} y1={c.height + 0.3} z0={c.lz0 + 0.3} z1={c.lz0 + 0.42} m={mat("#2b2f36", 0.4, 0.6)} />
      {/* The order kiosk by the door */}
      <group position={[P.kiosk.lx, 0, P.kiosk.lz]}>
        <Block x0={-0.5} x1={0.4} y0={0} y1={1.2} z0={-0.6} z1={0.6} m={mat("#2b2f36", 0.4, 0.5)} />
        <group position={[0.45, 1.95, 0]} rotation-y={Math.PI / 2} rotation-x={-0.15}>
          <Screen text={`ORDER\nHERE\n${SHOPS[shop].name.split(" ")[0]}`} bg={style.signBg} />
        </group>
        <Block x0={0.35} x1={0.42} y0={1.2} y1={2.7} z0={-0.5} z1={0.5} m={mat("#1b1d21", 0.4, 0.5)} />
      </group>
      {/* The kitchen */}
      <Block x0={P.prep.lx0} x1={P.prep.lx1} y0={0} y1={P.prep.height} z0={P.prep.lz0} z1={P.prep.lz1} m={mat("#c9ced4", 0.3, 0.8)} />
      <Machine shop={shop} box={P.machine} />
      <Props shop={shop} P={P} />
      {/* Shelves and the menu board on the back wall */}
      <group position={[0, room.height - 2.6, -room.depth + room.wall + 0.05]}>
        <MenuBoard shop={shop} w={Math.min(9, room.halfW)} />
      </group>
      <Block x0={2} x1={room.halfW - 1} y0={2.6} y1={2.7} z0={-room.depth + 0.6} z1={-room.depth + 1.4} m={mat("#8b5a3c", 0.7)} />
      {/* The dining area */}
      {P.tables.map((t) => (
        <Table key={t.lx} lx={t.lx} lz={t.lz} />
      ))}
      <ShopPeople shop={shop} />
    </Shell>
  );
}

export function RestaurantRow() {
  return (
    <>
      {(Object.keys(SHOPS) as ShopKey[]).map((k) => (
        <Shop key={k} shop={k} />
      ))}
    </>
  );
}

// ---- The people ----------------------------------------------------------------------------------

/** The customers and the NPC on shift. Drawn in the shop's frame (the Shell's group). */
function ShopPeople({ shop }: { shop: ShopKey }) {
  const [ids, setIds] = useState<number[]>([]);
  const key = useRef("");
  useFrame(() => {
    const list = jobs.shops[shop].customers.map((c) => c.id);
    const k = list.join(",");
    if (k !== key.current) {
      key.current = k;
      setIds(list);
    }
  });
  return (
    <>
      {ids.map((id) => (
        <CustomerFigure key={id} shop={shop} id={id} />
      ))}
      <Worker shop={shop} />
    </>
  );
}

const WORKER_ACCENT: Record<ShopKey, string> = { pizza: "#2f7d3a", icecream: "#ff8fb1", coffee: "#6b4329", burger: "#e01e37", flowers: "#3f6b4f" };

function Worker({ shop }: { shop: ShopKey }) {
  const g = useRef<THREE.Group>(null);
  const pose = useMemo(newPose, []);
  const look = useMemo<Look>(() => randomLook(shop.length * 77 + shop.charCodeAt(0), { outfit: "worker", accent: WORKER_ACCENT[shop], shirt: "#f2f0ea" }), [shop]);
  const P = shopPlan(shop);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const off = jobs.shift?.shop === shop;
    g.current.visible = !off;
    if (off) return;
    // Busy: shuffling between the counter and the prep table.
    const t = clock.elapsedTime * 0.35 + shop.length;
    const k = (Math.sin(t) + 1) / 2;
    g.current.position.set(P.staff.lx + Math.sin(t * 0.7) * 2.5, 0, P.staff.lz - k * 1.2);
    g.current.rotation.y = k > 0.6 ? 0 : Math.PI;
    pose.reach = Math.max(0, Math.sin(clock.elapsedTime * 1.3)) * 0.7;
    pose.gait = Math.abs(Math.cos(t)) > 0.5 ? 0.6 : 0;
    pose.phase += 0.08;
  });
  return (
    <group ref={g}>
      <Humanoid look={look} pose={pose} />
    </group>
  );
}

const TMP_Q = new THREE.Quaternion();

function CustomerFigure({ shop, id }: { shop: ShopKey; id: number }) {
  const room = roomOf(shop);
  const c0 = jobs.shops[shop].customers.find((c) => c.id === id);
  const look = useMemo(() => randomLook(c0?.seed ?? id), [c0?.seed, id]);
  const pose = useMemo(newPose, []);
  const g = useRef<THREE.Group>(null);
  const bar = useRef<THREE.Mesh>(null);
  const barMat = useRef<THREE.MeshBasicMaterial>(null);
  const bubble = useRef<THREE.Group>(null);
  const bag = useRef<THREE.Group>(null);
  useFrame(({ camera }, delta) => {
    const c: Customer | undefined = jobs.shops[shop].customers.find((x) => x.id === id);
    if (!g.current || !c) return;
    // World → the shop's frame.
    const dx = c.pos.x - room.site.x;
    const dz = c.pos.z - room.site.z;
    const co = Math.cos(room.site.turn);
    const si = Math.sin(room.site.turn);
    g.current.position.set(dx * co - dz * si, 0, dx * si + dz * co);
    g.current.rotation.y = c.yaw - room.site.turn;
    pose.gait = THREE.MathUtils.damp(pose.gait, c.moving ? 1 : 0, 8, delta);
    if (c.moving) pose.phase += delta * 3.4;
    pose.reach = c.state === "kiosk" && !c.moving ? 0.6 + Math.sin(jobs.now * 6) * 0.15 : 0;
    pose.handsUp = c.mood === "angry" && c.state === "leaving" ? 0.35 : 0;
    if (bag.current) bag.current.visible = c.holding;
    // The patience bar over their head (only while you're working here).
    const showBar = jobs.shift?.shop === shop && c.state !== "leaving";
    if (bubble.current) {
      bubble.current.visible = showBar;
      bubble.current.quaternion.copy(camera.quaternion);
      bubble.current.quaternion.premultiply(g.current.getWorldQuaternion(TMP_Q).invert());
    }
    const left = Math.max(0, 1 - (jobs.now - c.arrived) / c.patience);
    if (bar.current) {
      bar.current.scale.x = Math.max(0.001, left);
      bar.current.position.x = -(1 - left) * 0.6;
    }
    barMat.current?.color.set(left > 0.5 ? "#2fbf4a" : left > 0.25 ? "#f2b01e" : "#e5402b");
  });
  return (
    <group ref={g}>
      <Humanoid look={look} pose={pose} castShadow={false} />
      <group ref={bag} position={[0.45, 1.5, 0.35]} visible={false}>
        <mesh geometry={BOX} scale={[0.5, 0.6, 0.35]} raycast={noRaycast}>
          <meshStandardMaterial color={shop === "pizza" ? "#e8d2a8" : shop === "flowers" ? "#ff8fb1" : "#c49a6c"} roughness={0.9} />
        </mesh>
      </group>
      <group ref={bubble} position-y={4.2}>
        <mesh raycast={noRaycast}>
          <planeGeometry args={[1.32, 0.24]} />
          <meshBasicMaterial color="#111111" transparent opacity={0.7} depthWrite={false} />
        </mesh>
        <mesh ref={bar} position-z={0.01} raycast={noRaycast}>
          <planeGeometry args={[1.2, 0.14]} />
          <meshBasicMaterial ref={barMat} color="#2fbf4a" />
        </mesh>
      </group>
    </group>
  );
}
