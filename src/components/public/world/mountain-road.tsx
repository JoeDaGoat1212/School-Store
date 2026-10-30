"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Block, Cyl, mat } from "./buildings";
import { detailed, surface } from "./detail";
import { canvasTexture, fontFamily, noRaycast, seededRandom } from "./paint";
import { Static } from "./static-merge";
import { ROAD_HALF_W, ROAD_PATH, groundAt } from "./terrain";
import { Instances, type Place } from "./town";

/*
 * The road up to the secret base, done properly: worn asphalt with tyre
 * tracks, cracks and patched repairs under crisp edge lines and a double
 * yellow centre line with cat's-eye studs; gravel shoulders; dressed-stone
 * retaining walls where the road's cut into the hillside and steel crash
 * barriers where it drops away; reflector posts, chevron signs on every
 * sharp bend, street lamps, boulders, and a guarded checkpoint with a
 * barrier and floodlights where it reaches the base's valley.
 */

type Frame = { x: number; y: number; z: number; rx: number; rz: number; along: number; up: [number, number]; turn: number };

/** Each point on the road with its "right" direction, distance along, how high the land is either side, and how sharply it bends. */
function frames(): Frame[] {
  let along = 0;
  return ROAD_PATH.map((p, i) => {
    const q = ROAD_PATH[Math.min(i + 1, ROAD_PATH.length - 1)];
    const o = ROAD_PATH[Math.max(i - 1, 0)];
    const dx = q.x - o.x;
    const dz = q.z - o.z;
    const len = Math.hypot(dx, dz) || 1;
    const rx = -dz / len;
    const rz = dx / len;
    if (i > 0) along += Math.hypot(p.x - ROAD_PATH[i - 1].x, p.z - ROAD_PATH[i - 1].z);
    const side = (s: number) => groundAt(p.x + rx * s * 14, p.z + rz * s * 14) - p.y;
    // Bend: change of heading over the neighbouring points.
    const a = ROAD_PATH[Math.max(i - 3, 0)];
    const b = ROAD_PATH[Math.min(i + 3, ROAD_PATH.length - 1)];
    const h1 = Math.atan2(p.x - a.x, p.z - a.z);
    const h2 = Math.atan2(b.x - p.x, b.z - p.z);
    let turn = h2 - h1;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    return { x: p.x, y: p.y, z: p.z, rx, rz, along, up: [side(-1), side(1)], turn };
  });
}

/** A strip along the road between two offsets (right of the middle line), lifted `lift`. */
function ribbon(F: Frame[], from: number, to: number, lift: number, vScale: number, follow = false) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  F.forEach((f, i) => {
    for (const [k, off] of [
      [0, from],
      [1, to],
    ] as const) {
      const x = f.x + f.rx * off;
      const z = f.z + f.rz * off;
      pos.push(x, (follow ? Math.max(f.y, groundAt(x, z)) : f.y) + lift, z);
      uv.push(k, f.along / vScale);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    (g.index!.array as Uint16Array | Uint32Array).reverse();
    g.computeVertexNormals();
  }
  return g;
}

/** A wall along one side: from `bottom` up `height(f)`, at offset `off`, `thick` thick. */
function wallStrip(F: Frame[], off: number, thick: number, height: (f: Frame) => number, show: (f: Frame) => boolean) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let run = -1;
  F.forEach((f, i) => {
    const on = show(f);
    if (!on) {
      run = -1;
      return;
    }
    const hgt = height(f);
    const base = pos.length / 3;
    // Four points across: bottom-in, top-in, top-out, bottom-out.
    for (const [o, y] of [
      [off, f.y - 0.6],
      [off, f.y + hgt],
      [off + thick * Math.sign(off), f.y + hgt],
      [off + thick * Math.sign(off), f.y - 0.6],
    ] as const) {
      pos.push(f.x + f.rx * o, y, f.z + f.rz * o);
      uv.push(f.along / 3, (y - f.y) / 3);
    }
    if (run >= 0 && i > 0) {
      const p = run;
      for (let k = 0; k < 3; k++) idx.push(p + k, base + k, p + k + 1, p + k + 1, base + k, base + k + 1);
    }
    run = base;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function asphaltTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3f4348";
  g.fillRect(0, 0, 512, 1024);
  const r = seededRandom(23);
  // Aggregate.
  for (let i = 0; i < 26000; i++) {
    const v = r();
    g.fillStyle = v > 0.6 ? "rgba(255,255,255,0.05)" : v > 0.3 ? "rgba(0,0,0,0.09)" : "rgba(120,110,100,0.06)";
    g.fillRect(r() * 512, r() * 1024, 1 + r() * 2, 1 + r() * 2);
  }
  // Tyre tracks: darker, smoother bands in each lane's wheel paths.
  for (const x of [96, 176, 336, 416]) {
    const grad = g.createLinearGradient(x - 26, 0, x + 26, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.16)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - 26, 0, 52, 1024);
  }
  // Patched repairs.
  for (let i = 0; i < 4; i++) {
    g.fillStyle = "rgba(20,22,25,0.45)";
    g.fillRect(60 + r() * 360, r() * 960, 50 + r() * 90, 30 + r() * 70);
  }
  // Cracks.
  g.strokeStyle = "rgba(10,10,10,0.55)";
  g.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    let x = 30 + r() * 450;
    let y = r() * 1024;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (r() - 0.5) * 24;
      y += (r() - 0.3) * 22;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // Edge lines (slightly worn) and the double yellow centre line.
  const line = (x: number, w: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x, 0, w, 1024);
    g.fillStyle = "rgba(60,62,66,0.35)";
    for (let i = 0; i < 50; i++) g.fillRect(x + r() * w, r() * 1024, 2 + r() * 3, 4 + r() * 10);
  };
  line(16, 10, "#e9e9e4");
  line(486, 10, "#e9e9e4");
  line(244, 8, "#f1bf2e");
  line(260, 8, "#f1bf2e");
  return canvasTexture(c, [1, 1]);
}

function gravelTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#7d766b";
  g.fillRect(0, 0, 128, 256);
  const r = seededRandom(41);
  for (let i = 0; i < 5000; i++) {
    const v = r();
    g.fillStyle = v > 0.66 ? "#9a9286" : v > 0.33 ? "#5f594f" : "#8a8172";
    g.fillRect(r() * 128, r() * 256, 1 + r() * 3, 1 + r() * 3);
  }
  return canvasTexture(c, [1, 1]);
}

export function MountainRoad() {
  const F = useMemo(frames, []);
  const asphalt = useMemo(() => {
    const t = asphaltTexture();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
  const gravel = useMemo(() => {
    const t = gravelTexture();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
  const geos = useMemo(() => {
    const road = ribbon(F, -ROAD_HALF_W, ROAD_HALF_W, 0.09, 24);
    const shoulders = [ribbon(F, -ROAD_HALF_W - 1.8, -ROAD_HALF_W, 0.07, 6, true), ribbon(F, ROAD_HALF_W, ROAD_HALF_W + 1.8, 0.07, 6, true)];
    // Retaining walls on the uphill side (where the land rises well above the road), up to 5 high.
    const walls = [-1, 1].map((s) =>
      wallStrip(
        F,
        s * (ROAD_HALF_W + 1.9),
        0.9,
        (f) => Math.min(5, Math.max(1.2, f.up[s < 0 ? 0 : 1] * 0.55)),
        (f) => f.y > 3 && f.up[s < 0 ? 0 : 1] > 2.2,
      ),
    );
    // Crash barriers where it drops away.
    const rails = [-1, 1].map((s) =>
      wallStrip(
        F,
        s * (ROAD_HALF_W + 1.3),
        0.12,
        () => 0.85,
        (f) => f.y > 3 && f.up[s < 0 ? 0 : 1] < -1.2,
      ),
    );
    return { road, shoulders, walls, rails };
  }, [F]);
  useEffect(() => () => [geos.road, ...geos.shoulders, ...geos.walls, ...geos.rails].forEach((g) => g.dispose()), [geos]);

  // Posts along the barriers, reflector posts, cat's eyes, lamps, chevrons, boulders.
  const bits = useMemo(() => {
    const barrierPosts: { x: number; y: number; z: number }[] = [];
    const delineators: { x: number; y: number; z: number; turn: number; s: number }[] = [];
    const eyes: { x: number; y: number; z: number }[] = [];
    const lamps: { x: number; y: number; z: number; turn: number }[] = [];
    const chevrons: { x: number; y: number; z: number; turn: number; dir: number }[] = [];
    const rocks: { x: number; y: number; z: number; s: number; r: number }[] = [];
    const r = seededRandom(77);
    let lastEye = -99;
    let lastDel = -99;
    let lastLamp = -99;
    let lastChev = -99;
    F.forEach((f, i) => {
      const heading = Math.atan2(f.rz, -f.rx); // road direction as a turn
      for (const s of [-1, 1]) {
        const k = s < 0 ? 0 : 1;
        if (f.y > 3 && f.up[k] < -1.2 && i % 2 === 0) barrierPosts.push({ x: f.x + f.rx * s * (ROAD_HALF_W + 1.45), y: f.y, z: f.z + f.rz * s * (ROAD_HALF_W + 1.45) });
      }
      if (f.along - lastEye > 10) {
        lastEye = f.along;
        eyes.push({ x: f.x, y: f.y + 0.1, z: f.z });
      }
      if (f.along - lastDel > 25) {
        lastDel = f.along;
        for (const s of [-1, 1]) delineators.push({ x: f.x + f.rx * s * (ROAD_HALF_W + 2.2), y: f.y, z: f.z + f.rz * s * (ROAD_HALF_W + 2.2), turn: heading, s });
      }
      if (f.along - lastLamp > 55 && f.along > 30) {
        lastLamp = f.along;
        const s = f.up[0] > f.up[1] ? -1 : 1;
        lamps.push({ x: f.x + f.rx * s * (ROAD_HALF_W + 2.6), y: groundAt(f.x + f.rx * s * (ROAD_HALF_W + 2.6), f.z + f.rz * s * (ROAD_HALF_W + 2.6)), z: f.z + f.rz * s * (ROAD_HALF_W + 2.6), turn: Math.atan2(-f.rx * s, -f.rz * s) });
      }
      // Sharp bends: chevrons on the outside of the curve, facing the traffic both ways.
      if (Math.abs(f.turn) > 0.32 && f.along - lastChev > 14) {
        lastChev = f.along;
        const outside = f.turn > 0 ? -1 : 1;
        const off = outside * (ROAD_HALF_W + 3.2);
        chevrons.push({ x: f.x + f.rx * off, y: f.y, z: f.z + f.rz * off, turn: heading, dir: outside });
      }
      if (i % 3 === 0 && r() < 0.35) {
        const s = r() < 0.5 ? -1 : 1;
        const off = s * (ROAD_HALF_W + 4 + r() * 8);
        const x = f.x + f.rx * off;
        const z = f.z + f.rz * off;
        rocks.push({ x, y: groundAt(x, z), z, s: 0.5 + r() * 1.6, r: r() * 6 });
      }
    });
    return { barrierPosts, delineators, eyes, lamps, chevrons, rocks };
  }, [F]);

  const placePost: Place = useMemo(() => (i, o) => void o.position.set(bits.barrierPosts[i].x, bits.barrierPosts[i].y + 0.45, bits.barrierPosts[i].z), [bits]);
  const placeEye: Place = useMemo(() => (i, o) => void o.position.set(bits.eyes[i].x, bits.eyes[i].y, bits.eyes[i].z), [bits]);
  const placeDel: Place = useMemo(
    () => (i, o) => {
      const d = bits.delineators[i];
      o.position.set(d.x, d.y + 0.6, d.z);
      o.rotation.y = d.turn;
    },
    [bits],
  );
  const placeRef: Place = useMemo(
    () => (i, o) => {
      const d = bits.delineators[i];
      o.position.set(d.x, d.y + 1.0, d.z);
      o.rotation.y = d.turn;
      return d.s > 0 ? "#ffb02e" : "#ffffff";
    },
    [bits],
  );
  const placeRock: Place = useMemo(
    () => (i, o) => {
      const k = bits.rocks[i];
      o.position.set(k.x, k.y + k.s * 0.3, k.z);
      o.rotation.set(k.r, k.r * 2, k.r * 0.5);
      o.scale.set(k.s * 1.2, k.s * 0.8, k.s);
    },
    [bits],
  );
  const chevronTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f5c52e";
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#111111";
    for (const x of [30, 110, 190]) {
      g.beginPath();
      g.moveTo(x, 14);
      g.lineTo(x + 40, 64);
      g.lineTo(x, 114);
      g.lineTo(x + 22, 114);
      g.lineTo(x + 62, 64);
      g.lineTo(x + 22, 14);
      g.closePath();
      g.fill();
    }
    return canvasTexture(c);
  }, []);

  const wallM = useMemo(() => detailed(new THREE.MeshStandardMaterial({ color: "#8f877a", roughness: 0.95, side: THREE.DoubleSide }), "stone"), []);
  const railM = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b9bfc5", roughness: 0.3, metalness: 0.85, side: THREE.DoubleSide }), []);
  const postM = mat("#7f858c", 0.5, 0.6);
  const lampM = mat("#2b2f33", 0.5, 0.6);
  const glowM = mat("#fff3d6", 0.3, 0, "#ffdf9e");
  return (
    <group>
      <mesh geometry={geos.road} receiveShadow raycast={noRaycast}>
        <meshStandardMaterial map={asphalt} roughness={0.88} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {geos.shoulders.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow raycast={noRaycast}>
          <meshStandardMaterial map={gravel} roughness={0.97} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
      {geos.walls.map((g, i) => (
        <mesh key={`w${i}`} geometry={g} material={wallM} castShadow receiveShadow raycast={noRaycast} />
      ))}
      {geos.rails.map((g, i) => (
        <mesh key={`r${i}`} geometry={g} material={railM} castShadow raycast={noRaycast} />
      ))}
      <Instances count={bits.barrierPosts.length} place={placePost}>
        <boxGeometry args={[0.18, 0.9, 0.18]} />
        <primitive object={postM} attach="material" />
      </Instances>
      <Instances count={bits.eyes.length} place={placeEye}>
        <boxGeometry args={[0.25, 0.06, 0.18]} />
        <meshStandardMaterial color="#fff6d0" emissive="#ffe08a" emissiveIntensity={0.9} roughness={0.3} />
      </Instances>
      <Instances count={bits.delineators.length} place={placeDel}>
        <boxGeometry args={[0.16, 1.2, 0.16]} />
        <meshStandardMaterial color="#f4f4f2" roughness={0.6} />
      </Instances>
      <Instances count={bits.delineators.length} place={placeRef}>
        <boxGeometry args={[0.17, 0.22, 0.17]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} roughness={0.2} />
      </Instances>
      <Instances count={bits.rocks.length} place={placeRock} castShadow>
        <dodecahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#7a746b" roughness={1} flatShading />
      </Instances>
      <Static>
        {bits.lamps.map((l, i) => (
          <group key={i} position={[l.x, l.y, l.z]} rotation-y={l.turn}>
            <Cyl x={0} y={0.4} z={0} r={0.25} h={0.8} m={lampM} />
            <Cyl x={0} y={4.4} z={0} r={0.1} h={8} m={lampM} />
            <Block x0={-0.08} x1={0.08} y0={8.2} y1={8.35} z0={0} z1={2.6} m={lampM} />
            <Block x0={-0.35} x1={0.35} y0={7.95} y1={8.2} z0={2.1} z1={3.1} m={lampM} />
            <Block x0={-0.3} x1={0.3} y0={7.9} y1={7.96} z0={2.2} z1={3.0} m={glowM} />
          </group>
        ))}
        {bits.chevrons.map((c, i) => (
          <group key={`c${i}`} position={[c.x, c.y, c.z]} rotation-y={c.turn}>
            <Cyl x={0} y={1.1} z={0} r={0.06} h={2.2} m={postM} />
          </group>
        ))}
      </Static>
      {bits.chevrons.map((c, i) => (
        <group key={`cs${i}`} position={[c.x, c.y + 2.0, c.z]} rotation-y={c.turn}>
          {/* Chevrons point the way the road bends, seen from either direction. */}
          <mesh position-z={0.04} scale-x={c.dir > 0 ? -1 : 1} raycast={noRaycast}>
            <planeGeometry args={[1.6, 0.8]} />
            <meshStandardMaterial map={chevronTex} roughness={0.5} emissive="#4a3a08" emissiveIntensity={0.2} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      <Checkpoint F={F} />
      <RoadSigns F={F} />
    </group>
  );
}

/** Signs at the bottom of the road. */
function RoadSigns({ F }: { F: Frame[] }) {
  const f = F[Math.min(F.length - 1, 8)];
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 320;
    const g = c.getContext("2d")!;
    g.fillStyle = "#b8202a";
    g.fillRect(0, 0, 512, 320);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 10;
    g.strokeRect(12, 12, 488, 296);
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.font = `800 64px ${fontFamily("display")}`;
    g.fillText("PRIVATE ROAD", 256, 110);
    g.font = `600 36px ${fontFamily("body")}`;
    g.fillText("No through traffic", 256, 170);
    g.fillText("Steep bends next 2 miles", 256, 230);
    return canvasTexture(c);
  }, []);
  const speed = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 260;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 200, 260);
    g.strokeStyle = "#111";
    g.lineWidth = 8;
    g.strokeRect(8, 8, 184, 244);
    g.fillStyle = "#111";
    g.textAlign = "center";
    g.font = `700 34px ${fontFamily("body")}`;
    g.fillText("SPEED", 100, 56);
    g.fillText("LIMIT", 100, 92);
    g.font = `800 110px ${fontFamily("display")}`;
    g.fillText("35", 100, 210);
    return canvasTexture(c);
  }, []);
  const post = mat("#8a9098", 0.4, 0.7);
  const turn = Math.atan2(f.rz, -f.rx) + Math.PI;
  const off = ROAD_HALF_W + 3;
  return (
    <group>
      <group position={[f.x + f.rx * off, f.y, f.z + f.rz * off]} rotation-y={turn}>
        <Cyl x={-1.2} y={1.6} z={0} r={0.07} h={3.2} m={post} />
        <Cyl x={1.2} y={1.6} z={0} r={0.07} h={3.2} m={post} />
        <mesh position={[0, 3.2, 0.08]} raycast={noRaycast}>
          <planeGeometry args={[3.4, 2.1]} />
          <meshStandardMaterial map={tex} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <group position={[f.x - f.rx * off, f.y, f.z - f.rz * off]} rotation-y={turn}>
        <Cyl x={0} y={1.5} z={0} r={0.06} h={3} m={post} />
        <mesh position={[0, 2.8, 0.06]} raycast={noRaycast}>
          <planeGeometry args={[1, 1.3]} />
          <meshStandardMaterial map={speed} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

/** The guarded checkpoint where the road reaches the valley: a booth, a raised barrier, floodlights and a camera. */
function Checkpoint({ F }: { F: Frame[] }) {
  // Just before the valley: the last point below its height.
  const i = Math.max(0, F.findIndex((f) => f.y > 42.5));
  const f = F[i];
  const turn = Math.atan2(f.rz, -f.rx);
  const concrete = surface("concrete", "#8d8b86", 0.9);
  const booth = surface("panel", "#3d4a3a", 0.6, 0.2);
  const glass = mat("#24323b", 0.06, 0.8);
  const steel = mat("#7d848c", 0.35, 0.8);
  const red = mat("#d8262c", 0.5);
  const white = mat("#f2f2f0", 0.5);
  const lamp = mat("#fff9e6", 0.3, 0, "#fff3c4");
  const cam = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (cam.current) cam.current.rotation.y = Math.sin(s.clock.elapsedTime * 0.5) * 0.8;
  });
  const sign = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f5c52e";
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = "#111";
    g.fillRect(0, 0, 512, 56);
    g.fillStyle = "#f5c52e";
    g.font = `800 42px ${fontFamily("display")}`;
    g.textAlign = "center";
    g.fillText("RESTRICTED AREA", 256, 42);
    g.fillStyle = "#111";
    g.font = `700 36px ${fontFamily("body")}`;
    g.fillText("Authorised vehicles only", 256, 130);
    g.fillText("Stop at the checkpoint", 256, 190);
    return canvasTexture(c);
  }, []);
  const side = ROAD_HALF_W + 4.5;
  return (
    <group position={[f.x, f.y, f.z]} rotation-y={turn}>
      <Static>
        {/* The booth, on the right */}
        <group position={[side, 0, 0]}>
          <Block x0={-2.2} x1={2.2} y0={0} y1={0.4} z0={-2.8} z1={2.8} m={concrete} />
          <Block x0={-1.8} x1={1.8} y0={0.4} y1={3.4} z0={-2.4} z1={2.4} m={booth} cast />
          <Block x0={-1.82} x1={-1.8} y0={1.5} y1={3} z0={-2} z1={2} m={glass} />
          <Block x0={-2.2} x1={2.2} y0={3.4} y1={3.8} z0={-2.8} z1={2.8} m={steel} />
        </group>
        {/* Barrier posts and the raised arm */}
        <Block x0={ROAD_HALF_W + 0.5} x1={ROAD_HALF_W + 1.3} y0={0} y1={1.2} z0={-0.4} z1={0.4} m={red} />
        <group position={[ROAD_HALF_W + 0.9, 1.1, 0]} rotation-z={1.35}>
          {Array.from({ length: 6 }, (_, k) => (
            <Block key={k} x0={-0.12} x1={0.12} y0={k * 1.9} y1={(k + 1) * 1.9} z0={-0.08} z1={0.08} m={k % 2 ? white : red} />
          ))}
        </group>
        {/* Floodlights either side */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * (ROAD_HALF_W + 6), 0, -6]}>
            <Cyl x={0} y={5} z={0} r={0.15} h={10} m={steel} />
            <Block x0={-1.2} x1={1.2} y0={9.6} y1={10.4} z0={-0.3} z1={0.3} m={steel} />
            <Block x0={-1} x1={1} y0={9.7} y1={10.3} z0={0.3} z1={0.34} m={lamp} />
          </group>
        ))}
        {/* Spikes strip (retracted) and rumble strips */}
        {Array.from({ length: 5 }, (_, k) => (
          <Block key={`rs${k}`} x0={-ROAD_HALF_W} x1={ROAD_HALF_W} y0={0.08} y1={0.14} z0={12 + k * 1.2} z1={12.5 + k * 1.2} m={white} />
        ))}
      </Static>
      {/* The camera on its pole, panning */}
      <group position={[side, 3.8, -2]}>
        <Cyl x={0} y={1.2} z={0} r={0.06} h={2.4} m={steel} />
        <group ref={cam} position-y={2.5}>
          <Block x0={-0.2} x1={0.2} y0={-0.2} y1={0.2} z0={0} z1={0.8} m={white} />
        </group>
      </group>
      <group position={[-(ROAD_HALF_W + 3), 0, 6]}>
        <Cyl x={-1.3} y={1.4} z={0} r={0.07} h={2.8} m={steel} />
        <Cyl x={1.3} y={1.4} z={0} r={0.07} h={2.8} m={steel} />
        <mesh position={[0, 2.6, 0.08]} raycast={noRaycast}>
          <planeGeometry args={[3.6, 1.8]} />
          <meshStandardMaterial map={sign} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
