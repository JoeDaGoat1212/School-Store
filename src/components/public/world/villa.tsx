"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Block, Cyl, mat } from "./buildings";
import { surface } from "./detail";
import { rng } from "./golf-course";
import { noRaycast } from "./paint";
import { Static } from "./static-merge";

/*
 * Mansions as architecture, not boxes: a generator for the big houses along
 * the golf course and through Crescent Heights. Each one's worked out from a
 * seed, in one of three styles, with its garden:
 *
 *   Modern: offset stacked volumes in white render, timber and dark metal,
 *     walls of glass with slim mullions, a cantilevered upper floor over the
 *     terrace, flat roofs with thin copings, glass balustrades on the roof
 *     terrace, and an infinity pool on a stone deck.
 *   Mediterranean: warm render under terracotta hip roofs, an arcade of
 *     arches (a loggia), arched windows with shutters, iron balconies, a
 *     square tower, and a courtyard fountain.
 *   Classical: dressed stone with a columned portico and pediment, matching
 *     wings, a balustraded parapet, tall sash windows with stone surrounds,
 *     chimneys, and formal box hedges round a lawn.
 *
 * Drawn in the house's own frame: x across its front (−w/2…w/2), its front
 * at z = 0 facing +z, going back to z = −d; the garden is out front (z > 0).
 * Everything's merged into a few meshes (Static).
 */

export type VillaStyle = "modern" | "mediterranean" | "classical";
export type VillaSpec = { w: number; d: number; seed: number; style?: VillaStyle; /** How deep the front garden is (default 22). */ front?: number };

const DARK_GLASS = new THREE.MeshStandardMaterial({ color: "#1a242d", roughness: 0.05, metalness: 0.85 });
const WATER = new THREE.MeshStandardMaterial({ color: "#2f8fb0", roughness: 0.04, metalness: 0.2, emissive: "#0b3d52", emissiveIntensity: 0.4 });
const HEDGE = new THREE.MeshStandardMaterial({ color: "#2f5a2a", roughness: 0.95 });
const LAWN = new THREE.MeshStandardMaterial({ color: "#4f8a35", roughness: 0.95 });
const FLOWERS = ["#e8664f", "#f2d14b", "#b48ad9", "#f4f1e6", "#e98fb0", "#ff9a3c"];
const ROUND = new THREE.SphereGeometry(1, 14, 10);

export function styleFor(seed: number): VillaStyle {
  return (["modern", "mediterranean", "classical"] as const)[seed % 3];
}

export function Villa({ spec }: { spec: VillaSpec }) {
  const style = spec.style ?? styleFor(spec.seed);
  const body = useMemo(() => {
    if (style === "modern") return <Modern spec={spec} />;
    if (style === "mediterranean") return <Mediterranean spec={spec} />;
    return <Classical spec={spec} />;
  }, [spec, style]);
  return (
    <Static>
      {body}
      <Garden spec={spec} style={style} />
    </Static>
  );
}

// ---- Windows --------------------------------------------------------------------------------------

/** A window in a wall facing +z (or rotated): dark glass, a frame, mullions, a sill. */
function Win({ x, y, z, w, h, turn = 0, frame, arch = false, shutters }: { x: number; y: number; z: number; w: number; h: number; turn?: number; frame: THREE.Material; arch?: boolean; shutters?: THREE.Material }) {
  return (
    <group position={[x, y, z]} rotation-y={turn}>
      <Block x0={-w / 2} x1={w / 2} y0={-h / 2} y1={h / 2} z0={-0.05} z1={0.04} m={DARK_GLASS} />
      {arch && (
        <mesh position={[0, h / 2, 0.03]} material={DARK_GLASS} raycast={noRaycast}>
          <circleGeometry args={[w / 2, 16, 0, Math.PI]} />
        </mesh>
      )}
      {/* Frame */}
      <Block x0={-w / 2 - 0.12} x1={w / 2 + 0.12} y0={h / 2} y1={h / 2 + 0.16} z0={0} z1={0.16} m={frame} />
      <Block x0={-w / 2 - 0.12} x1={-w / 2} y0={-h / 2} y1={h / 2} z0={0} z1={0.14} m={frame} />
      <Block x0={w / 2} x1={w / 2 + 0.12} y0={-h / 2} y1={h / 2} z0={0} z1={0.14} m={frame} />
      {/* Mullions */}
      <Block x0={-0.04} x1={0.04} y0={-h / 2} y1={h / 2} z0={0.02} z1={0.09} m={frame} />
      <Block x0={-w / 2} x1={w / 2} y0={h * 0.12 - 0.035} y1={h * 0.12 + 0.035} z0={0.02} z1={0.09} m={frame} />
      {/* Sill */}
      <Block x0={-w / 2 - 0.25} x1={w / 2 + 0.25} y0={-h / 2 - 0.16} y1={-h / 2} z0={0} z1={0.32} m={frame} />
      {shutters &&
        [-1, 1].map((s) => <Block key={s} x0={s < 0 ? -w / 2 - 0.75 : w / 2 + 0.15} x1={s < 0 ? -w / 2 - 0.15 : w / 2 + 0.75} y0={-h / 2} y1={h / 2} z0={0.02} z1={0.1} m={shutters} />)}
    </group>
  );
}

/** A full-height wall of glass with slim mullions (facing +z). */
function GlassWall({ x0, x1, y0, y1, z, frame }: { x0: number; x1: number; y0: number; y1: number; z: number; frame: THREE.Material }) {
  const n = Math.max(2, Math.round((x1 - x0) / 2.4));
  return (
    <group>
      <Block x0={x0} x1={x1} y0={y0} y1={y1} z0={z - 0.06} z1={z + 0.02} m={DARK_GLASS} />
      {Array.from({ length: n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n).map((x) => (
        <Block key={x} x0={x - 0.06} x1={x + 0.06} y0={y0} y1={y1} z0={z} z1={z + 0.1} m={frame} />
      ))}
      <Block x0={x0} x1={x1} y0={y1 - 0.1} y1={y1} z0={z} z1={z + 0.12} m={frame} />
      <Block x0={x0} x1={x1} y0={y0} y1={y0 + 0.1} z0={z} z1={z + 0.12} m={frame} />
    </group>
  );
}

// ---- Modern ---------------------------------------------------------------------------------------

function Modern({ spec }: { spec: VillaSpec }) {
  const r = rng(spec.seed);
  const W = spec.w / 2;
  const D = spec.d;
  const S = 4.2;
  const white = surface("stucco", "#eceae4", 0.85);
  const wood = surface("planks", "#8a6446", 0.8);
  const dark = surface("panel", "#2c3036", 0.5, 0.4);
  const frame = mat("#1e2125", 0.4, 0.6);
  const stone = surface("stone", "#cfc6b4", 0.85);
  const shift = (r() - 0.5) * W * 0.5;
  const upW = W * (0.62 + r() * 0.2);
  return (
    <group>
      {/* The plinth */}
      <Block x0={-W - 0.6} x1={W + 0.6} y0={0} y1={0.5} z0={-D - 0.6} z1={0.6} m={stone} cast />
      {/* Ground floor: render, with a timber-clad block at one end */}
      <Block x0={-W} x1={W * 0.25} y0={0.5} y1={S} z0={-D} z1={-D * 0.18} m={white} cast />
      <Block x0={W * 0.25} x1={W} y0={0.5} y1={S} z0={-D} z1={-D * 0.08} m={wood} cast />
      <GlassWall x0={-W + 0.4} x1={W * 0.25 - 0.4} y0={0.5} y1={S - 0.2} z={-D * 0.18} frame={frame} />
      {/* Upper floor: a long box sliding out over the terrace (a cantilever), walled in glass */}
      <group position-x={shift}>
        <Block x0={-upW} x1={upW} y0={S} y1={S + 0.45} z0={-D * 0.92} z1={4.2} m={dark} cast />
        <Block x0={-upW} x1={upW} y0={S + 0.45} y1={S * 2} z0={-D * 0.92} z1={-D * 0.92 + 0.5} m={white} cast />
        {[-1, 1].map((s) => (
          <Block key={s} x0={s < 0 ? -upW : upW - 0.5} x1={s < 0 ? -upW + 0.5 : upW} y0={S + 0.45} y1={S * 2} z0={-D * 0.92} z1={4.2} m={white} cast />
        ))}
        <GlassWall x0={-upW + 0.5} x1={upW - 0.5} y0={S + 0.45} y1={S * 2 - 0.1} z={4.1} frame={frame} />
        <Block x0={-upW - 0.3} x1={upW + 0.3} y0={S * 2} y1={S * 2 + 0.5} z0={-D * 0.92 - 0.3} z1={4.5} m={white} cast />
        <Block x0={-upW - 0.32} x1={upW + 0.32} y0={S * 2 + 0.5} y1={S * 2 + 0.6} z0={-D * 0.92 - 0.32} z1={4.52} m={frame} />
        {/* Roof terrace: a glass balustrade and a pergola of slim beams */}
        {Array.from({ length: 9 }, (_, i) => -upW * 0.6 + (i * upW * 1.2) / 8).map((x) => (
          <Block key={x} x0={x - 0.07} x1={x + 0.07} y0={S * 2 + 3} y1={S * 2 + 3.25} z0={-D * 0.5} z1={1} m={wood} />
        ))}
        {[-1, 1].map((s) => (
          <Block key={`pp${s}`} x0={s * upW * 0.6 - 0.12} x1={s * upW * 0.6 + 0.12} y0={S * 2 + 0.6} y1={S * 2 + 3.2} z0={0.6} z1={0.84} m={frame} />
        ))}
      </group>
      {/* A tall, narrow stair tower in dark panels */}
      <Block x0={-W - 0.2} x1={-W + 3.4} y0={0.5} y1={S * 2.3} z0={-D * 0.7} z1={-D * 0.35} m={dark} cast />
      <Block x0={-W + 3.38} x1={-W + 3.44} y0={1} y1={S * 2.2} z0={-D * 0.66} z1={-D * 0.39} m={DARK_GLASS} />
      {/* Side and back windows */}
      {[-1, 1].map((s) =>
        Array.from({ length: Math.max(1, Math.floor(D / 6)) }, (_, i) => -D * 0.2 - i * 5.5).map((z) => (
          <Win key={`${s}${z}`} x={s * (W + 0.02)} y={S * 0.55} z={z} w={2.6} h={2.4} turn={(s * Math.PI) / 2} frame={frame} />
        )),
      )}
      {Array.from({ length: Math.max(2, Math.floor(spec.w / 6)) }, (_, i) => -W + 3 + i * 6).map((x) => (
        <Win key={`b${x}`} x={x} y={S * 0.55} z={-D - 0.02} w={2.8} h={2.4} turn={Math.PI} frame={frame} />
      ))}
      {/* The entrance canopy */}
      <Block x0={W * 0.3} x1={W * 0.95} y0={S - 0.6} y1={S - 0.35} z0={-D * 0.08} z1={2.5} m={frame} />
      {/* The infinity pool on its deck, and loungers */}
      <Block x0={-W} x1={W * 0.2} y0={0} y1={0.55} z0={1.5} z1={10} m={stone} />
      <Block x0={-W + 1} x1={W * 0.2 - 1} y0={0.55} y1={0.58} z0={3.5} z1={9} m={WATER} />
      {[-W + 2, -W + 5, -W + 8].map((x) => (
        <group key={x}>
          <Block x0={x - 0.4} x1={x + 0.4} y0={0.55} y1={0.85} z0={1.8} z1={3.2} m={mat("#f2f0ea", 0.6)} />
          <Block x0={x - 0.4} x1={x + 0.4} y0={0.85} y1={1.4} z0={1.8} z1={2.1} m={mat("#f2f0ea", 0.6)} />
        </group>
      ))}
    </group>
  );
}

// ---- Mediterranean ------------------------------------------------------------------------------

function HipRoof({ w, d, x, y, z, color, rise }: { w: number; d: number; x: number; y: number; z: number; color: string; rise: number }) {
  const geo = useMemo(() => new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4), []);
  return <mesh geometry={geo} material={surface("shingle", color, 0.85)} position={[x, y + rise / 2, z]} scale={[w + 1.4, rise, d + 1.4]} castShadow receiveShadow raycast={noRaycast} />;
}

function Mediterranean({ spec }: { spec: VillaSpec }) {
  const r = rng(spec.seed + 3);
  const W = spec.w / 2;
  const D = spec.d;
  const S = 4.4;
  const walls = ["#ead7b8", "#e7cfa6", "#f0e2c8", "#dfc49c"];
  const wall = surface("stucco", walls[Math.floor(r() * walls.length)], 0.9);
  const tile = "#b4583a";
  const trim = mat("#f4ecdd", 0.6);
  const iron = mat("#22201e", 0.5, 0.6);
  const shutter = mat(["#2f5d62", "#6b4a2b", "#3b5a7a"][Math.floor(r() * 3)], 0.6);
  const stone = surface("stone", "#cbb898", 0.9);
  const mainW = W * 0.72;
  return (
    <group>
      {/* Main house: two floors */}
      <Block x0={-mainW} x1={mainW} y0={0} y1={S * 2} z0={-D} z1={-3} m={wall} cast />
      <Block x0={-mainW - 0.2} x1={mainW + 0.2} y0={S - 0.15} y1={S + 0.15} z0={-D - 0.2} z1={-2.8} m={trim} />
      <HipRoof w={mainW * 2} d={D - 3} x={0} y={S * 2} z={-(D + 3) / 2} color={tile} rise={4.2} />
      {/* A one-storey wing each side */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block x0={s < 0 ? -W : mainW} x1={s < 0 ? -mainW : W} y0={0} y1={S} z0={-D * 0.8} z1={-1} m={wall} cast />
          <HipRoof w={W - mainW} d={D * 0.8 - 1} x={s * (W + mainW) / 2} y={S} z={-(D * 0.8 + 1) / 2} color={tile} rise={2.6} />
          <Win x={s * (W + mainW) / 2} y={S * 0.55} z={-0.98} w={2} h={2.4} frame={trim} arch shutters={shutter} />
        </group>
      ))}
      {/* The loggia: an arcade of arches across the front */}
      {(() => {
        const n = Math.max(3, Math.round(mainW / 2.2));
        const span = (mainW * 2) / n;
        return (
          <group>
            {Array.from({ length: n + 1 }, (_, i) => -mainW + i * span).map((x) => (
              <Block key={x} x0={x - 0.4} x1={x + 0.4} y0={0} y1={S - 0.6} z0={-0.6} z1={0.2} m={wall} cast />
            ))}
            {Array.from({ length: n }, (_, i) => -mainW + (i + 0.5) * span).map((x) => (
              <mesh key={`a${x}`} position={[x, S - 0.6, -0.2]} rotation-x={Math.PI / 2} material={wall} raycast={noRaycast}>
                <torusGeometry args={[span / 2 - 0.4, 0.4, 6, 16, Math.PI]} />
              </mesh>
            ))}
            <Block x0={-mainW - 0.4} x1={mainW + 0.4} y0={S - 0.6} y1={S + 0.3} z0={-3} z1={0.2} m={wall} cast />
            <Block x0={-mainW - 0.5} x1={mainW + 0.5} y0={S + 0.3} y1={S + 0.5} z0={-3} z1={0.35} m={trim} />
          </group>
        );
      })()}
      {/* Upstairs: arched windows with shutters, and an iron balcony in the middle */}
      {Array.from({ length: Math.max(2, Math.round(mainW / 3)) }, (_, i) => -mainW + ((i + 0.5) * mainW * 2) / Math.max(2, Math.round(mainW / 3))).map((x) => (
        <Win key={x} x={x} y={S * 1.55} z={-2.98} w={1.6} h={2.4} frame={trim} arch shutters={shutter} />
      ))}
      <group position={[0, S + 0.5, -2.6]}>
        {Array.from({ length: 13 }, (_, i) => -3 + i * 0.5).map((x) => (
          <Block key={x} x0={x - 0.03} x1={x + 0.03} y0={0} y1={1.1} z0={0} z1={0.06} m={iron} />
        ))}
        <Block x0={-3.1} x1={3.1} y0={1.05} y1={1.15} z0={-0.05} z1={0.1} m={iron} />
      </group>
      {/* The tower */}
      <group position={[mainW * 0.55, 0, -D * 0.75]}>
        <Block x0={-2.6} x1={2.6} y0={0} y1={S * 3.1} z0={-2.6} z1={2.6} m={wall} cast />
        <Win x={0} y={S * 2.5} z={2.62} w={1.4} h={2.2} frame={trim} arch />
        <HipRoof w={5.2} d={5.2} x={0} y={S * 3.1} z={0} color={tile} rise={3} />
      </group>
      {/* The courtyard fountain on a stone terrace */}
      <Block x0={-mainW} x1={mainW} y0={0} y1={0.25} z0={0.2} z1={9} m={stone} />
      <Cyl x={0} y={0.6} z={5} r={2.6} h={0.7} m={stone} />
      <Cyl x={0} y={0.97} z={5} r={2.3} h={0.05} m={WATER} />
      <Cyl x={0} y={1.6} z={5} r={0.3} h={1.6} m={stone} />
      <Cyl x={0} y={2.4} z={5} r={1.1} h={0.25} m={stone} />
    </group>
  );
}

// ---- Classical ------------------------------------------------------------------------------------

function Classical({ spec }: { spec: VillaSpec }) {
  const r = rng(spec.seed + 7);
  const W = spec.w / 2;
  const D = spec.d;
  const S = 4.6;
  const stone = surface("stone", ["#e2dccf", "#d8cdb9", "#e8e2d6"][Math.floor(r() * 3)], 0.8);
  const base = surface("stone", "#b9b09f", 0.85);
  const trim = mat("#f3f0e8", 0.5);
  const slate = "#4b5058";
  const centerW = W * 0.5;
  const pediment = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-centerW - 0.6, 0);
    s.lineTo(centerW + 0.6, 0);
    s.lineTo(0, 3.2);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false });
  }, [centerW]);
  const cols = Math.max(4, Math.round(centerW / 1.4) * 2);
  return (
    <group>
      {/* Base course */}
      <Block x0={-W - 0.4} x1={W + 0.4} y0={0} y1={1.0} z0={-D - 0.4} z1={0.4} m={base} cast />
      {/* The central block (taller) and two wings */}
      <Block x0={-centerW} x1={centerW} y0={1} y1={S * 2 + 1} z0={-D} z1={-4.5} m={stone} cast />
      {[-1, 1].map((s) => (
        <Block key={s} x0={s < 0 ? -W : centerW} x1={s < 0 ? -centerW : W} y0={1} y1={S * 2} z0={-D * 0.9} z1={-1.2} m={stone} cast />
      ))}
      {/* Cornice and a balustraded parapet round the wings */}
      {[-1, 1].map((s) => (
        <group key={`c${s}`}>
          <Block x0={s < 0 ? -W - 0.4 : centerW} x1={s < 0 ? -centerW : W + 0.4} y0={S * 2} y1={S * 2 + 0.45} z0={-D * 0.9 - 0.4} z1={-0.8} m={trim} />
          {Array.from({ length: Math.round((W - centerW) / 0.55) }, (_, i) => (s < 0 ? -W : centerW) + 0.3 + i * 0.55).map((x) => (
            <Cyl key={x} x={x} y={S * 2 + 0.95} z={-1.0} r={0.13} h={0.9} m={trim} />
          ))}
          <Block x0={s < 0 ? -W - 0.3 : centerW} x1={s < 0 ? -centerW : W + 0.3} y0={S * 2 + 1.4} y1={S * 2 + 1.6} z0={-1.3} z1={-0.7} m={trim} />
        </group>
      ))}
      {/* The portico: columns, entablature and pediment */}
      <Block x0={-centerW - 0.6} x1={centerW + 0.6} y0={1} y1={1.25} z0={-4.5} z1={1.5} m={base} />
      {Array.from({ length: cols }, (_, i) => -centerW + ((i + 0.5) * centerW * 2) / cols).map((x) => (
        <group key={x}>
          <Cyl x={x} y={1.25 + (S * 2 - 0.3) / 2} z={0.6} r={0.42} h={S * 2 - 0.3} m={trim} />
          <Block x0={x - 0.55} x1={x + 0.55} y0={S * 2 + 0.75} y1={S * 2 + 1.0} z0={0.05} z1={1.15} m={trim} />
        </group>
      ))}
      <Block x0={-centerW - 0.6} x1={centerW + 0.6} y0={S * 2 + 1} y1={S * 2 + 2} z0={-4.5} z1={1.5} m={trim} cast />
      <mesh geometry={pediment} material={trim} position={[0, S * 2 + 2, 0.3]} castShadow raycast={noRaycast} />
      <HipRoof w={centerW * 2} d={D - 4.5} x={0} y={S * 2 + 1} z={-(D + 4.5) / 2} color={slate} rise={5.5} />
      {/* Tall windows with stone surrounds, two floors */}
      {[0, 1].flatMap((f) =>
        Array.from({ length: Math.max(2, Math.round((W - centerW) / 3)) }, (_, i) => [-1, 1].map((s) => {
          const x = s * (centerW + ((i + 0.5) * (W - centerW)) / Math.max(2, Math.round((W - centerW) / 3)));
          return <Win key={`${f}${s}${i}`} x={x} y={1 + S * (f + 0.55)} z={-1.18} w={1.5} h={2.9} frame={trim} />;
        })).flat(),
      )}
      {[0, 1].flatMap((f) => [-1, 0, 1].map((k) => <Win key={`m${f}${k}`} x={k * centerW * 0.55} y={1 + S * (f + 0.55)} z={-4.48} w={1.4} h={2.9} frame={trim} />))}
      {/* Chimneys */}
      {[-1, 1].map((s) => (
        <group key={`ch${s}`}>
          <Block x0={s * centerW * 0.7 - 0.8} x1={s * centerW * 0.7 + 0.8} y0={S * 2 + 2} y1={S * 2 + 7.5} z0={-D * 0.55 - 0.8} z1={-D * 0.55 + 0.8} m={stone} cast />
          <Block x0={s * centerW * 0.7 - 1} x1={s * centerW * 0.7 + 1} y0={S * 2 + 7.5} y1={S * 2 + 7.8} z0={-D * 0.55 - 1} z1={-D * 0.55 + 1} m={trim} />
        </group>
      ))}
      {/* Steps up to the door, and urns either side */}
      {[0, 1, 2].map((k) => (
        <Block key={`st${k}`} x0={-centerW * 0.6} x1={centerW * 0.6} y0={0} y1={1 - k * 0.33} z0={1.5 + k * 0.8} z1={2.3 + k * 0.8} m={base} />
      ))}
      {[-1, 1].map((s) => (
        <group key={`u${s}`} position={[s * (centerW * 0.6 + 0.8), 0, 3.4]}>
          <Block x0={-0.6} x1={0.6} y0={0} y1={1.2} z0={-0.6} z1={0.6} m={base} />
          <mesh geometry={ROUND} material={trim} position-y={1.8} scale={[0.6, 0.55, 0.6]} raycast={noRaycast} />
          <mesh geometry={ROUND} material={HEDGE} position-y={2.6} scale={0.6} raycast={noRaycast} />
        </group>
      ))}
    </group>
  );
}

// ---- The garden ------------------------------------------------------------------------------------

function Garden({ spec, style }: { spec: VillaSpec; style: VillaStyle }) {
  const r = rng(spec.seed + 11);
  const W = spec.w / 2;
  const front = spec.front ?? 22;
  const paver = surface("stone", "#cfc6b6", 0.9);
  const beds: { x: number; z: number; c: string }[] = [];
  for (let i = 0; i < 26; i++) {
    const s = r() < 0.5 ? -1 : 1;
    beds.push({ x: s * (W * 0.45 + r() * W * 0.55), z: Math.min(front - 1, 10) * 0.4 + r() * Math.max(1, front - Math.min(front - 1, 10) * 0.4 - 1), c: FLOWERS[Math.floor(r() * FLOWERS.length)] });
  }
  return (
    <group>
      {/* A lawn out front, and a path of pavers to the door */}
      <Block x0={-W - 4} x1={W + 4} y0={0.01} y1={0.05} z0={0.5} z1={front} m={LAWN} />
      <Block x0={-1.4} x1={1.4} y0={0.05} y1={0.1} z0={0.5} z1={front} m={paver} />
      {/* Clipped hedges down the sides (and box balls along the path for the classical houses) */}
      {[-1, 1].map((s) => (
        <Block key={s} x0={s * (W + 3.6) - 0.6} x1={s * (W + 3.6) + 0.6} y0={0} y1={1.3} z0={-spec.d * 0.6} z1={front} m={HEDGE} cast />
      ))}
      {style === "classical"
        ? Array.from({ length: 6 }, (_, i) => 11 + i * 2).filter((z) => z < front).flatMap((z) => [-1, 1].map((s) => <mesh key={`${z}${s}`} geometry={ROUND} material={HEDGE} position={[s * 2.4, 0.6, z]} scale={0.65} raycast={noRaycast} />))
        : null}
      {/* Flower beds */}
      {beds.map((b, i) => (
        <mesh key={i} geometry={ROUND} material={mat(b.c, 0.7)} position={[b.x, 0.35, b.z]} scale={[0.7, 0.38, 0.7]} raycast={noRaycast} />
      ))}
      {/* Garden lamps along the path */}
      {[6, 12, 18].filter((z) => z < front).flatMap((z) =>
        [-1, 1].map((s) => (
          <group key={`l${z}${s}`} position={[s * 1.9, 0, z]}>
            <Cyl x={0} y={0.55} z={0} r={0.06} h={1.1} m={mat("#22201e", 0.5, 0.6)} />
            <mesh geometry={ROUND} material={mat("#fff3d6", 0.3, 0, "#ffe2a8")} position-y={1.15} scale={0.16} raycast={noRaycast} />
          </group>
        )),
      )}
    </group>
  );
}
