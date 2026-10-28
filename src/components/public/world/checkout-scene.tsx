"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { StoreItem } from "../store/layout";
import { useLook } from "../store/models";
import { CheckoutLane } from "./fixtures";
import { ORANGE, TEAL, TEAL_DEEP, canvasTexture, noRaycast, signTexture } from "./paint";
import { COUNTER, type LANES } from "./world-layout";

/*
 * Checkout lane 1, where your order is rung up:
 *
 *   1. Each item is put down on the belt, one after another. Drinks stand up;
 *      chips, candy and snacks lie flat.
 *   2. The belt carries it to the end (the belt only runs while something is
 *      on it).
 *   3. The cashier reaches over, picks it up, passes it over the scanner
 *      (a red flash: beep!) and drops it into the bag on the other side.
 *   4. The screen on top of the register shows each item as it's scanned,
 *      then the total, like at a real store.
 *
 * All positions here are in the lane's own coordinates: the register end of
 * the counter is at z = 0 and the belt runs back from it into -z. You (the
 * customer) stand on the -x side; the cashier stands on the +x side.
 */

/** One thing going down the belt. It can stand for more than one of the same product. */
export type TillUnit = {
  key: string;
  name: string;
  /** The product's 3D look (null for bundles and anything not in the 3D store: drawn as a box). */
  item: StoreItem | null;
  color: string;
  /** Price for everything this one stands for. */
  cents: number;
};

/** What the screen on the register says (two lines). */
export type TillDisplay = { top: [string, string]; bottom: [string, string]; big?: boolean };

// ---- The timeline for each item, in seconds (real-store speed) ----------------------------------
const GAP = 1.9; // between one item and the next (the cashier needs 1.8 s for each)
const PLACE = 0.6; // put down on the belt
const BELT_START = -5.2;
const BELT_END = -0.95;
const SPEED = 1.4; // belt speed, scene units a second
const RIDE = (BELT_END - BELT_START) / SPEED;
// The cashier's part, after the item reaches the end of the belt:
const REACH = 0.35; // hand goes to the item
const SCAN = 0.6; // item passed over the scanner
const TO_BAG = 0.55; // carried over to the bag
const DROP = 0.3; // let go: it falls into the bag
const CASHIER = REACH + SCAN + TO_BAG + DROP;

/** Things on the belt are drawn a bit bigger than on the shelves, so you can follow them from where you stand. */
const ITEM_SCALE = 1.6;
const BELT_Y = COUNTER + 0.02;
const SCANNER = new THREE.Vector3(0.15, COUNTER + 0.012, -0.35);
const BAG = new THREE.Vector3(0.25, COUNTER - 0.01, 0.62);
const BAG_H = 1.1;

/**
 * Where the cashier stands: behind the counter, across from you, at the end of
 * the belt with the scanner right in front (the register stand is past them,
 * on their left).
 */
const CASHIER_AT = new THREE.Vector3(1.8, 0, -0.55);

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) => out.copy(a).lerp(b, t);

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
  // How fast the belt runs this moment (read by the belt every frame).
  const beltSpeed = useRef(0);
  // Where the cashier's hands should go this frame (the Cashier works out the arms).
  const hands = useRef(new CashierHands());
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

  // Small differences so items don't sit in a perfect line.
  const jitter = useMemo(() => units.map((_, i) => ({ x: ((((i * 37) % 7) / 7 - 0.5) * 0.5), turn: (((i * 53) % 9) / 9 - 0.5) * 0.8 })), [units]);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3() }), []);

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;
    const p = progress.current;
    const h = hands.current;
    // The scanner's red light fades back down after each beep.
    if (flash.current) flash.current.emissiveIntensity = THREE.MathUtils.damp(flash.current.emissiveIntensity, 0.4, 6, delta);
    h.reset();
    if (!running || calm || units.length === 0) {
      beltSpeed.current = 0;
      for (const g of groups.current) if (g) g.visible = false;
      return;
    }
    if (p.start < 0) p.start = now;
    // (While developing, tests can slow the show down to take pictures of it.)
    const slow = process.env.NODE_ENV === "production" ? 1 : ((window as unknown as { __tillSlow?: number }).__tillSlow ?? 1);
    const t = (now - p.start) / slow;
    // Wave hello while the first item comes down the belt.
    h.wave = t < PLACE + RIDE - 0.4 ? t : -1;

    let riding = false;
    units.forEach((_, i) => {
      const g = groups.current[i];
      if (!g) return;
      const local = t - i * GAP;
      const { x, turn } = jitter[i];
      g.rotation.set(0, turn, 0);
      g.scale.setScalar(1);
      if (local < 0) {
        g.visible = false;
        return;
      }
      g.visible = true;
      const u = local - PLACE - RIDE; // time since it reached the end of the belt
      let k: number;
      if ((k = local / PLACE) < 1) {
        // 1. You put it down on the belt (your hand comes in from the left).
        const e = ease(k);
        g.position.set(THREE.MathUtils.lerp(-1.2, x, e), BELT_Y + 1.0 * (1 - e) + Math.sin(e * Math.PI) * 0.3, BELT_START);
      } else if (u < 0) {
        // 2. Riding the belt.
        riding = true;
        g.position.set(x, BELT_Y, BELT_START + SPEED * (local - PLACE));
      } else if (u < REACH) {
        // 3a. Waiting at the end while the cashier reaches for it.
        g.position.set(x, BELT_Y, BELT_END);
        h.right.copy(g.position).setY(BELT_Y + 0.35);
        h.rightPull = ease(u / REACH);
      } else if (u < REACH + SCAN) {
        // 3b. Picked up and passed over the scanner… beep!
        k = (u - REACH) / SCAN;
        const e = ease(clamp01(k / 0.6));
        tmp.a.set(x, BELT_Y + 0.35, BELT_END);
        tmp.b.set(SCANNER.x, BELT_Y + 0.75, SCANNER.z);
        lerpV(tmp.a, tmp.b, e, h.right);
        h.right.z += Math.sin(clamp01((k - 0.5) / 0.5) * Math.PI) * 0.25;
        h.rightPull = 1;
        g.position.copy(h.rightHand).setY(h.rightHand.y - 0.35);
        g.rotation.z = Math.sin(clamp01((k - 0.4) / 0.6) * Math.PI) * 0.4;
      } else if (u < REACH + SCAN + TO_BAG) {
        // 3c. Over to the bag on the other side.
        const e = ease((u - REACH - SCAN) / TO_BAG);
        tmp.a.set(SCANNER.x, BELT_Y + 0.75, SCANNER.z);
        tmp.b.set(BAG.x, BAG.y + BAG_H + 0.6, BAG.z);
        lerpV(tmp.a, tmp.b, e, h.right);
        h.right.y += Math.sin(e * Math.PI) * 0.3;
        h.rightPull = 1;
        g.position.copy(h.rightHand).setY(h.rightHand.y - 0.35);
      } else if (u < CASHIER) {
        // 3d. Let go: it drops into the bag.
        const e = clamp01((u - REACH - SCAN - TO_BAG) / DROP);
        h.right.set(BAG.x, BAG.y + BAG_H + 0.6, BAG.z);
        h.rightPull = 1 - e;
        g.position.set(BAG.x, THREE.MathUtils.lerp(BAG.y + BAG_H + 0.25, BAG.y + 0.08, e * e), BAG.z);
        g.scale.setScalar(1 - e * 0.1);
      } else {
        // In the bag.
        g.position.set(BAG.x + x * 0.4, BAG.y + 0.08, BAG.z);
        g.scale.setScalar(0.9);
        if (i === units.length - 1 && !p.bagged) {
          p.bagged = true;
          onBaggedRef.current();
        }
      }
    });

    // Beep for every item that has reached the scanner by now (worked out from
    // the time, so a slow frame can't skip one).
    while (p.scanned < units.length - 1 && t - (p.scanned + 1) * GAP > PLACE + RIDE + REACH + SCAN * 0.6) {
      p.scanned++;
      if (flash.current) flash.current.emissiveIntensity = 6;
      onScannedRef.current(p.scanned);
    }
    // The belt only runs while something is riding on it.
    beltSpeed.current = riding ? SPEED : 0;
  });

  return (
    <group position={[lane.x, 0, lane.front]}>
      <group position={[-lane.x, 0, -lane.front]}>
        <CheckoutLane lane={lane} speed={beltSpeed} divider={false} />
      </group>

      {/* The scanner window in the counter, with its red laser line */}
      <mesh position={[SCANNER.x, SCANNER.y, SCANNER.z]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[0.9, 0.42]} />
        <meshStandardMaterial color="#15171a" roughness={0.1} metalness={0.6} />
      </mesh>
      <mesh position={[SCANNER.x, SCANNER.y + 0.004, SCANNER.z]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[0.8, 0.04]} />
        <meshStandardMaterial ref={flash} color="#400" emissive="#ff2a2a" emissiveIntensity={0.4} toneMapped={false} />
      </mesh>

      <BagOnRack position={[BAG.x, BAG.y, BAG.z]} />
      <Cashier hands={hands} calm={calm} />
      <PoleDisplay display={display} />

      {units.map((u, i) => (
        <group key={u.key} name={`till-unit-${i}`} ref={(g) => void (groups.current[i] = g)} visible={false}>
          <group scale={ITEM_SCALE}>{u.item ? <ProductOnBelt item={u.item} /> : <BundleBox color={u.color} />}</group>
        </group>
      ))}
    </group>
  );
}

/**
 * A product resting on the belt: drinks (and cups) stand up; bags, bars and
 * boxes lie down on their biggest flat side. Its bottom sits exactly on the belt.
 */
function ProductOnBelt({ item }: { item: StoreItem }) {
  const look = useLook(item.model, item.name, item.color);
  const fit = useMemo(() => {
    if (!look) return null;
    const g = look.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const box = g.boundingBox!;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const upright = item.unit === "drinks" || item.model.type === "lathe";
    // Lying down: tip it so its thinnest side points up.
    let rotation: [number, number, number] = [0, 0, 0];
    let height = size.y;
    if (!upright) {
      if (size.z <= size.x && size.z <= size.y) {
        rotation = [-Math.PI / 2, 0, 0]; // face up
        height = size.z;
      } else if (size.x <= size.y) {
        rotation = [0, 0, Math.PI / 2]; // on its side
        height = size.x;
      }
    }
    return { rotation, lift: height / 2, offset: center.clone().negate() };
  }, [look, item.unit, item.model.type]);
  if (!look || !fit) return null;
  return (
    <group position-y={fit.lift}>
      <group rotation={fit.rotation}>
        <mesh geometry={look.geometry} material={look.material} position={fit.offset} raycast={noRaycast} />
      </group>
    </group>
  );
}

/** A bundle (or anything without a 3D model): a little box in its colour, lying flat. */
function BundleBox({ color }: { color: string }) {
  return (
    <RoundedBox args={[0.7, 0.4, 0.45]} radius={0.05} position-y={0.2} raycast={noRaycast}>
      <meshStandardMaterial color={color} roughness={0.6} />
    </RoundedBox>
  );
}

// ---- The bag --------------------------------------------------------------------------------

/** A white shopping bag held open on a little metal rack, with the store's orange print. */
function BagOnRack({ position }: { position: [number, number, number] }) {
  const print = signTexture("Thank you!", { bg: "transparent", fg: ORANGE, height: 96, pad: 0.2, upper: false });
  const metal = <meshStandardMaterial color="#c9ced3" metalness={0.8} roughness={0.3} />;
  const plastic = <meshStandardMaterial color="#fbfbf8" roughness={0.55} side={THREE.DoubleSide} />;
  const rx = 0.42; // half its width (front to back as you look at it)
  const rz = 0.55; // half its length along the counter
  return (
    <group position={position}>
      {/* The rack: two posts and a bar the handles hang from */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.15, BAG_H / 2 + 0.25, s * (rz + 0.08)]} raycast={noRaycast}>
          <cylinderGeometry args={[0.03, 0.03, BAG_H + 0.5, 8]} />
          {metal}
        </mesh>
      ))}
      <mesh position={[0.15, BAG_H + 0.5, 0]} rotation-x={Math.PI / 2} raycast={noRaycast}>
        <cylinderGeometry args={[0.03, 0.03, rz * 2 + 0.16, 8]} />
        {metal}
      </mesh>
      {/* The bag: an open tube with a bottom, a bit narrower at the base */}
      <mesh position-y={BAG_H / 2} scale={[1, 1, rz / rx]} raycast={noRaycast}>
        <cylinderGeometry args={[rx, rx * 0.92, BAG_H, 28, 1, true]} />
        {plastic}
      </mesh>
      <mesh position-y={0.01} rotation-x={-Math.PI / 2} scale={[1, rz / rx, 1]} raycast={noRaycast}>
        <circleGeometry args={[rx * 0.92, 28]} />
        {plastic}
      </mesh>
      {/* Handles, pulled up over the rack bar */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.15, BAG_H + 0.25, s * rz * 0.5]} rotation-y={Math.PI / 2} raycast={noRaycast}>
          <torusGeometry args={[0.24, 0.035, 8, 20, Math.PI]} />
          {plastic}
        </mesh>
      ))}
      {/* "Thank you!" printed on the side facing you */}
      <mesh position={[-rx - 0.005, BAG_H * 0.55, 0]} rotation-y={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[0.9, 0.9 / print.aspect]} />
        <meshBasicMaterial map={print.texture} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---- The cashier --------------------------------------------------------------------------------

/**
 * Where the cashier's hands are headed this frame, filled in by the checkout
 * timeline. `rightPull` is how far the hand goes there (0 = arm resting by the side).
 */
class CashierHands {
  right = new THREE.Vector3();
  rightPull = 0;
  /** Where the right hand actually ended up (items follow it). */
  rightHand = new THREE.Vector3();
  /** Seconds into a wave hello (or -1: not waving). */
  wave = -1;
  reset() {
    this.rightPull = 0;
    this.wave = -1;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const SHOULDER_Y = 4.5;
const SHOULDER_HALF = 0.5;
const ARM = 1.2; // each half of the arm

/** Puts a 1-tall cylinder between two points. */
function stretch(mesh: THREE.Object3D | null | undefined, a: THREE.Vector3, b: THREE.Vector3, dir: THREE.Vector3) {
  if (!mesh) return;
  dir.subVectors(b, a);
  const len = dir.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
}

/** Two-part arm: from the shoulder to the hand, bending the elbow when the hand is close. */
function solveArm(shoulder: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, elbow: THREE.Vector3, hand: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(target, shoulder);
  const d = THREE.MathUtils.clamp(dir.length(), 0.4, ARM * 2 - 0.001);
  dir.normalize();
  hand.copy(shoulder).addScaledVector(dir, d);
  const bend = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  elbow
    .copy(shoulder)
    .addScaledVector(dir, d / 2)
    .addScaledVector(bend, Math.sqrt(Math.max(0, ARM * ARM - (d / 2) ** 2)));
}

/**
 * The store employee behind the counter: teal shirt, orange apron, name tag
 * and cap. Waves hello, reaches for each item, scans it and bags it.
 */
function Cashier({ hands, calm }: { hands: React.RefObject<CashierHands>; calm: boolean }) {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const rUpper = useRef<THREE.Mesh>(null);
  const rLower = useRef<THREE.Mesh>(null);
  const rHandMesh = useRef<THREE.Mesh>(null);
  const lUpper = useRef<THREE.Mesh>(null);
  const lLower = useRef<THREE.Mesh>(null);
  const lHandMesh = useRef<THREE.Mesh>(null);
  const s = useRef({ yaw: -Math.PI / 2, rHand: new THREE.Vector3(), lHand: new THREE.Vector3(), started: false });
  const tag = signTexture("Sam", { bg: "#ffffff", fg: "#111111", height: 64, pad: 0.5, upper: false });
  const v = useMemo(
    () => ({
      rs: new THREE.Vector3(),
      ls: new THREE.Vector3(),
      re: new THREE.Vector3(),
      le: new THREE.Vector3(),
      rh: new THREE.Vector3(),
      lh: new THREE.Vector3(),
      t: new THREE.Vector3(),
      d: new THREE.Vector3(),
      right: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      pole: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((state, delta) => {
    const h = hands.current;
    const st = s.current;
    const time = state.clock.elapsedTime;
    // Turn a little toward whatever the right hand is reaching for.
    let yaw = -Math.PI / 2;
    if (h.rightPull > 0.01) {
      const toward = Math.atan2(h.right.x - CASHIER_AT.x, h.right.z - CASHIER_AT.z);
      yaw += THREE.MathUtils.clamp(((toward - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -0.7, 0.7) * 0.6;
    }
    st.yaw = THREE.MathUtils.damp(st.yaw, yaw, 8, delta);
    if (body.current) {
      body.current.rotation.y = st.yaw;
      // Breathing.
      body.current.position.y = calm ? 0 : Math.sin(time * 1.6) * 0.02;
    }
    if (head.current) head.current.rotation.y = calm ? 0 : Math.sin(time * 0.5) * 0.15;

    // Shoulders, from where the body is facing.
    v.fwd.set(Math.sin(st.yaw), 0, Math.cos(st.yaw));
    v.right.set(-Math.cos(st.yaw), 0, Math.sin(st.yaw));
    v.rs.copy(CASHIER_AT).addScaledVector(v.right, SHOULDER_HALF).setY(SHOULDER_Y);
    v.ls.copy(CASHIER_AT).addScaledVector(v.right, -SHOULDER_HALF).setY(SHOULDER_Y);

    // Right hand: resting by the side, or reaching where the timeline says.
    v.t.copy(v.rs).addScaledVector(v.fwd, 0.35).addScaledVector(v.right, 0.15).setY(SHOULDER_Y - 2.1);
    if (h.rightPull > 0) v.t.lerp(h.right, h.rightPull);
    st.rHand.lerp(v.t, st.started ? 1 - Math.exp(-18 * delta) : 1);
    v.pole.set(0, -1, 0).addScaledVector(v.right, 0.6).addScaledVector(v.fwd, -0.4);
    solveArm(v.rs, st.rHand, v.pole, v.re, v.rh);
    h.rightHand.copy(v.rh);

    // Left hand: by the side, or waving hello.
    if (h.wave >= 0 && !calm) {
      v.t.copy(v.ls).addScaledVector(v.right, -0.5 + Math.sin(h.wave * 9) * 0.35).addScaledVector(v.fwd, 0.5).setY(SHOULDER_Y + 1.7);
    } else {
      v.t.copy(v.ls).addScaledVector(v.fwd, 0.35).addScaledVector(v.right, -0.15).setY(SHOULDER_Y - 2.1);
    }
    st.lHand.lerp(v.t, st.started ? 1 - Math.exp(-10 * delta) : 1);
    v.pole.set(0, -1, 0).addScaledVector(v.right, -0.6).addScaledVector(v.fwd, -0.4);
    solveArm(v.ls, st.lHand, v.pole, v.le, v.lh);
    st.started = true;

    stretch(rUpper.current, v.rs, v.re, v.d);
    stretch(rLower.current, v.re, v.rh, v.d);
    stretch(lUpper.current, v.ls, v.le, v.d);
    stretch(lLower.current, v.le, v.lh, v.d);
    rHandMesh.current?.position.copy(v.rh);
    lHandMesh.current?.position.copy(v.lh);
  });

  const skin = <meshStandardMaterial color="#c98e62" roughness={0.6} />;
  const shirt = <meshStandardMaterial color={TEAL} roughness={0.7} />;
  const pants = <meshStandardMaterial color="#2b2f36" roughness={0.8} />;

  return (
    <group>
      <group ref={body} position={[CASHIER_AT.x, 0, CASHIER_AT.z]} rotation-y={-Math.PI / 2}>
        {/* Legs and shoes */}
        {[-0.22, 0.22].map((x) => (
          <group key={x} position-x={x}>
            <mesh position-y={1.35} raycast={noRaycast}>
              <cylinderGeometry args={[0.17, 0.15, 2.5, 12]} />
              {pants}
            </mesh>
            <RoundedBox args={[0.3, 0.2, 0.5]} radius={0.08} position={[0, 0.1, 0.08]} raycast={noRaycast}>
              <meshStandardMaterial color="#111" roughness={0.5} />
            </RoundedBox>
          </group>
        ))}
        {/* Body: teal shirt, orange apron, name tag */}
        <RoundedBox args={[1.1, 2.1, 0.6]} radius={0.22} position-y={3.6} raycast={noRaycast}>
          {shirt}
        </RoundedBox>
        <RoundedBox args={[0.95, 1.6, 0.06]} radius={0.03} position={[0, 3.2, 0.3]} raycast={noRaycast}>
          <meshStandardMaterial color={ORANGE} roughness={0.7} />
        </RoundedBox>
        <mesh position={[0.25, 4.15, 0.34]} raycast={noRaycast}>
          <planeGeometry args={[0.3, 0.3 / tag.aspect]} />
          <meshBasicMaterial map={tag.texture} toneMapped={false} />
        </mesh>
        {/* Shoulders (round, so the arms join on smoothly) */}
        {[-SHOULDER_HALF, SHOULDER_HALF].map((x) => (
          <mesh key={x} position={[x, SHOULDER_Y, 0]} raycast={noRaycast}>
            <sphereGeometry args={[0.2, 14, 10]} />
            {shirt}
          </mesh>
        ))}
        {/* Neck and head, with a teal cap */}
        <mesh position-y={4.75} raycast={noRaycast}>
          <cylinderGeometry args={[0.13, 0.15, 0.3, 12]} />
          {skin}
        </mesh>
        <group ref={head} position-y={5.2}>
          <mesh raycast={noRaycast}>
            <sphereGeometry args={[0.42, 24, 18]} />
            {skin}
          </mesh>
          {/* Eyes and smile */}
          {[-0.14, 0.14].map((x) => (
            <mesh key={x} position={[x, 0.05, 0.39]} raycast={noRaycast}>
              <sphereGeometry args={[0.05, 10, 8]} />
              <meshStandardMaterial color="#1a1a1a" />
            </mesh>
          ))}
          <mesh position={[0, -0.12, 0.38]} rotation-z={Math.PI} raycast={noRaycast}>
            <torusGeometry args={[0.12, 0.022, 6, 16, Math.PI]} />
            <meshStandardMaterial color="#6b2a1f" />
          </mesh>
          {/* Cap: dome and brim */}
          <mesh position-y={0.08} raycast={noRaycast}>
            <sphereGeometry args={[0.44, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={TEAL_DEEP} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.1, 0.4]} rotation-x={0.12} raycast={noRaycast}>
            <cylinderGeometry args={[0.3, 0.3, 0.04, 20, 1, false, -Math.PI / 2, Math.PI]} />
            <meshStandardMaterial color={TEAL_DEEP} roughness={0.6} />
          </mesh>
        </group>
      </group>

      {/* Arms: drawn in the counter's coordinates and moved every frame */}
      <mesh ref={rUpper} raycast={noRaycast}>
        <cylinderGeometry args={[0.15, 0.13, 1, 10]} />
        {shirt}
      </mesh>
      <mesh ref={rLower} raycast={noRaycast}>
        <cylinderGeometry args={[0.12, 0.1, 1, 10]} />
        {skin}
      </mesh>
      <mesh ref={rHandMesh} raycast={noRaycast}>
        <sphereGeometry args={[0.14, 12, 10]} />
        {skin}
      </mesh>
      <mesh ref={lUpper} raycast={noRaycast}>
        <cylinderGeometry args={[0.15, 0.13, 1, 10]} />
        {shirt}
      </mesh>
      <mesh ref={lLower} raycast={noRaycast}>
        <cylinderGeometry args={[0.12, 0.1, 1, 10]} />
        {skin}
      </mesh>
      <mesh ref={lHandMesh} raycast={noRaycast}>
        <sphereGeometry args={[0.14, 12, 10]} />
        {skin}
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

/** The screen on a pole on the register stand, facing you (to the right of the cashier), like at a real store. */
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
    <group position={[1.7, COUNTER + 2.55, 1.25]} rotation-y={-Math.PI / 2 - 0.35}>
      {/* The pole down to the register stand */}
      <mesh position={[0, -1.35, -0.1]} raycast={noRaycast}>
        <cylinderGeometry args={[0.05, 0.07, 2.4, 10]} />
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
