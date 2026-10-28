"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { StoreItem } from "../store/layout";
import { useLook } from "../store/models";
import { CheckoutLane } from "./fixtures";
import { canvasTexture, noRaycast } from "./paint";
import { COUNTER, type LANES } from "./world-layout";

/*
 * Checkout lane 1, where your order is rung up:
 *
 *   1. Each item is put on the belt, one after another.
 *   2. The belt carries it to the end, the cashier lifts it over the scanner
 *      (a red flash: beep!), then drops it into the paper bag.
 *   3. The screen on top of the register shows each item as it's scanned,
 *      then the total, like at a real store.
 *
 * All positions here are in the lane's own coordinates: the register end of
 * the counter is at z = 0 and the belt runs back from it into -z. The customer
 * (you) stands on the -x side.
 */

/** One thing going down the belt. It can stand for more than one of the same product. */
export type TillUnit = {
  key: string;
  name: string;
  /** The product's 3D look (null for bundles and anything not in the 3D store: drawn as a box). */
  item: StoreItem | null;
  /** How it sits on the shelf (so it sits the same way on the belt). */
  tilt: number;
  turn: number;
  color: string;
  /** Price for everything this one stands for. */
  cents: number;
};

/** What the screen on the register says (two lines). */
export type TillDisplay = { top: [string, string]; bottom: [string, string]; big?: boolean };

// The timeline for each item, in seconds (normal, real-store speed).
const GAP = 1.3; // between one item and the next
const PLACE = 0.6; // hand puts it on the belt
const BELT_START = -5.2;
const BELT_END = -0.95;
const SPEED = 1.4; // belt speed, scene units a second
const RIDE = (BELT_END - BELT_START) / SPEED;
const SCAN = 1.0; // lifted over the scanner
const BAG = 0.75; // into the bag
const BELT_Y = COUNTER + 0.02;
const SCANNER = new THREE.Vector3(0.15, BELT_Y + 0.7, -0.35);
const BAG_AT = new THREE.Vector3(0.3, BELT_Y, 0.62);
/** Things on the belt are drawn a bit bigger than on the shelves, so you can follow them from where you stand. */
const ITEM_SCALE = 1.6;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export function CheckoutCounter({
  lane,
  units,
  running,
  calm,
  display,
  onScanned,
  onBagged,
}: {
  lane: (typeof LANES)[number];
  /** The items to ring up (empty when nobody's checking out). */
  units: TillUnit[];
  /** True once you're standing at the counter: the ringing up starts. */
  running: boolean;
  calm: boolean;
  display: TillDisplay;
  onScanned: (index: number) => void;
  onBagged: () => void;
}) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const flash = useRef<THREE.MeshStandardMaterial>(null);
  const progress = useRef({ start: -1, scanned: -1, bagged: false });
  const onScannedRef = useRef(onScanned);
  const onBaggedRef = useRef(onBagged);
  useEffect(() => {
    onScannedRef.current = onScanned;
    onBaggedRef.current = onBagged;
  });
  // A new order: start the clock again.
  useEffect(() => {
    progress.current = { start: -1, scanned: -1, bagged: false };
  }, [units]);

  // "Reduce motion" is on: skip the show, ring everything up at once.
  useEffect(() => {
    if (!calm || !running || units.length === 0) return;
    units.forEach((_, i) => onScannedRef.current(i));
    onBaggedRef.current();
  }, [calm, running, units]);

  // A list of jitters, so items don't all sit in a perfect line.
  const offsets = useMemo(() => units.map((_, i) => ((i * 37) % 7) / 7 - 0.5), [units]);

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;
    const p = progress.current;
    // The scanner's red light fades back down after each beep.
    if (flash.current) flash.current.emissiveIntensity = THREE.MathUtils.damp(flash.current.emissiveIntensity, 0.4, 6, delta);
    if (!running || calm || units.length === 0) {
      for (const g of groups.current) if (g) g.visible = false;
      return;
    }
    if (p.start < 0) p.start = now;
    // (While developing, tests can slow the show down to take pictures of it.)
    const slow = process.env.NODE_ENV === "production" ? 1 : ((window as unknown as { __tillSlow?: number }).__tillSlow ?? 1);
    const t = (now - p.start) / slow;

    // Beep for every item that has reached the scanner by now (worked out from
    // the time, so a slow frame can't skip one).
    while (p.scanned < units.length - 1 && t - (p.scanned + 1) * GAP > PLACE + RIDE + SCAN * 0.55) {
      p.scanned++;
      if (flash.current) flash.current.emissiveIntensity = 6;
      onScannedRef.current(p.scanned);
    }

    units.forEach((_, i) => {
      const g = groups.current[i];
      if (!g) return;
      const local = t - i * GAP;
      const x = offsets[i] * 0.6;
      if (local < 0) {
        g.visible = false;
        return;
      }
      g.visible = true;
      g.scale.setScalar(1);
      let k: number;
      if ((k = local / PLACE) < 1) {
        // 1. Put down on the belt (from your hand, over on the left).
        const e = ease(k);
        g.position.set(THREE.MathUtils.lerp(-1.7, x, e), BELT_Y + 1.1 * (1 - e) + Math.sin(e * Math.PI) * 0.35, BELT_START);
      } else if ((k = (local - PLACE) / RIDE) < 1) {
        // 2. Ride the belt to the end.
        g.position.set(x, BELT_Y, BELT_START + (BELT_END - BELT_START) * k);
      } else if ((k = (local - PLACE - RIDE) / SCAN) < 1) {
        // 3. Lifted over the scanner, turned to find the barcode… beep!
        const e = ease(clamp01(k / 0.4));
        g.position.set(THREE.MathUtils.lerp(x, SCANNER.x, e), THREE.MathUtils.lerp(BELT_Y, SCANNER.y, e), THREE.MathUtils.lerp(BELT_END, SCANNER.z, e));
        g.rotation.z = Math.sin(clamp01((k - 0.3) / 0.5) * Math.PI) * 0.35;

      } else if ((k = (local - PLACE - RIDE - SCAN) / BAG) < 1) {
        // 4. Over to the bag and dropped in.
        g.rotation.z = 0;
        const e = ease(k);
        g.position.set(
          THREE.MathUtils.lerp(SCANNER.x, BAG_AT.x, e),
          THREE.MathUtils.lerp(SCANNER.y, BAG_AT.y + 0.12, e) + Math.sin(e * Math.PI) * 0.7,
          THREE.MathUtils.lerp(SCANNER.z, BAG_AT.z, e),
        );
        g.scale.setScalar(1 - e * 0.15);
      } else {
        // In the bag (hidden by its paper sides).
        g.position.copy(BAG_AT).setY(BAG_AT.y + 0.12);
        g.scale.setScalar(0.85);
        if (i === units.length - 1 && !p.bagged) {
          p.bagged = true;
          onBaggedRef.current();
        }
      }
    });
  });

  return (
    <group position={[lane.x, 0, lane.front]}>
      <CheckoutLaneAt lane={lane} running={running && units.length > 0} />

      {/* The scanner window in the counter, with its red light */}
      <mesh position={[SCANNER.x, COUNTER + 0.012, SCANNER.z]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[0.9, 0.42]} />
        <meshStandardMaterial color="#15171a" roughness={0.1} metalness={0.6} />
      </mesh>
      {/* The red laser line in the glass: it flashes on every beep */}
      <mesh position={[SCANNER.x, COUNTER + 0.016, SCANNER.z]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[0.8, 0.04]} />
        <meshStandardMaterial ref={flash} color="#400" emissive="#ff2a2a" emissiveIntensity={0.4} toneMapped={false} />
      </mesh>

      {/* An open paper bag, so the items really go in */}
      <PaperBag position={[BAG_AT.x, BELT_Y - 0.02, BAG_AT.z]} />

      {/* The customer's screen on a pole on top of the register */}
      <PoleDisplay display={display} />

      {units.map((u, i) => (
        <group key={u.key} name={`till-unit-${i}`} ref={(g) => void (groups.current[i] = g)} visible={false}>
          <group rotation={[u.tilt, u.turn, 0, "YXZ"]} scale={ITEM_SCALE}>{u.item ? <ProductModel item={u.item} /> : <BundleBox color={u.color} />}</group>
        </group>
      ))}
    </group>
  );
}

/** The lane itself (belt, register…), drawn at the origin because CheckoutCounter already moved there. */
function CheckoutLaneAt({ lane, running }: { lane: (typeof LANES)[number]; running: boolean }) {
  return (
    <group position={[-lane.x, 0, -lane.front]}>
      <CheckoutLane lane={lane} beltSpeed={running ? SPEED : 0.5} bag={false} divider={false} />
    </group>
  );
}

function ProductModel({ item }: { item: StoreItem }) {
  const look = useLook(item.model, item.name, item.color);
  if (!look) return null;
  return <mesh geometry={look.geometry} material={look.material} raycast={noRaycast} />;
}

/** A bundle (or anything without a 3D model): a little box in its colour. */
function BundleBox({ color }: { color: string }) {
  return (
    <RoundedBox args={[0.7, 0.45, 0.45]} radius={0.05} position-y={0.225} raycast={noRaycast}>
      <meshStandardMaterial color={color} roughness={0.6} />
    </RoundedBox>
  );
}

/** A brown paper bag with an open top: four sides and a bottom. */
function PaperBag({ position }: { position: [number, number, number] }) {
  const w = 1.25;
  const d = 0.8;
  const h = 1.05;
  const t = 0.02;
  const paper = <meshStandardMaterial color="#c89b67" roughness={0.95} />;
  return (
    <group position={position}>
      <mesh position={[0, t / 2, 0]} raycast={noRaycast}>
        <boxGeometry args={[w, t, d]} />
        {paper}
      </mesh>
      {[
        [0, h / 2, d / 2, w, h, t],
        [0, h / 2, -d / 2, w, h, t],
        [w / 2, h / 2, 0, t, h, d],
        [-w / 2, h / 2, 0, t, h, d],
      ].map(([x, y, z, sx, sy, sz], i) => (
        <mesh key={i} position={[x, y, z]} raycast={noRaycast}>
          <boxGeometry args={[sx, sy, sz]} />
          {paper}
        </mesh>
      ))}
      {/* Folded rim */}
      <mesh position={[0, h, 0]} raycast={noRaycast}>
        <boxGeometry args={[w + 0.03, 0.05, d + 0.03]} />
        <meshStandardMaterial color="#b8895a" roughness={0.95} />
      </mesh>
    </group>
  );
}

// ---- The register's customer screen ---------------------------------------------------------

const LCD_W = 640;
const LCD_H = 260;

/** A green-on-black screen, redrawn whenever its words change. */
function makeLcd() {
  const canvas = document.createElement("canvas");
  canvas.width = LCD_W;
  canvas.height = LCD_H;
  const texture = canvasTexture(canvas);
  const ctx = canvas.getContext("2d")!;
  return {
    texture,
    draw(d: TillDisplay) {
      ctx.fillStyle = "#04140d";
      ctx.fillRect(0, 0, LCD_W, LCD_H);
      ctx.fillStyle = "#62ffaa";
      ctx.shadowColor = "#39ff8e";
      ctx.shadowBlur = 14;
      ctx.textBaseline = "middle";
      const font = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
      const line = (text: [string, string], y: number, size: number) => {
        ctx.font = `700 ${size}px ${font}`;
        ctx.textAlign = "left";
        let left = text[0].toUpperCase();
        while (left.length > 3 && ctx.measureText(left).width > LCD_W - 80 - ctx.measureText(text[1]).width) left = left.slice(0, -2) + "…";
        ctx.fillText(left, 30, y);
        ctx.textAlign = "right";
        ctx.fillText(text[1], LCD_W - 30, y);
      };
      if (d.big) {
        line(d.top, 70, 44);
        line(d.bottom, 175, 84);
      } else {
        line(d.top, 80, 46);
        line(d.bottom, 180, 46);
      }
      texture.needsUpdate = true;
    },
  };
}

/** The screen on a pole on top of the register, facing you, like at a real store. */
function PoleDisplay({ display }: { display: TillDisplay }) {
  const lcd = useMemo(() => makeLcd(), []);
  const key = JSON.stringify(display);
  useEffect(() => {
    lcd.draw(JSON.parse(key) as TillDisplay);
  }, [lcd, key]);
  useEffect(() => () => lcd.texture.dispose(), [lcd]);

  const w = 2.1;
  const h = (w * LCD_H) / LCD_W;
  return (
    <group position={[1.55, COUNTER + 2.35, -1.0]} rotation-y={-Math.PI / 2 - 0.25}>
      {/* The pole down to the register */}
      <mesh position={[0, -1.05, -0.1]} raycast={noRaycast}>
        <cylinderGeometry args={[0.05, 0.07, 1.5, 10]} />
        <meshStandardMaterial color="#2a2c30" metalness={0.5} roughness={0.4} />
      </mesh>
      <RoundedBox args={[w + 0.22, h + 0.22, 0.2]} radius={0.05} position-z={-0.1} raycast={noRaycast}>
        <meshStandardMaterial color="#17181b" roughness={0.4} />
      </RoundedBox>
      <mesh position-z={0.005} raycast={noRaycast}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={lcd.texture} toneMapped={false} />
      </mesh>
    </group>
  );
}
