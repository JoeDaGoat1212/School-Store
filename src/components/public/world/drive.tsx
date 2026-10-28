"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Car, LAMPS, LOT_HALF, PARKED_CARS, TREES } from "./exterior";
import { BUILDING } from "./world-layout";

/*
 * Moving around with the keyboard (and, on phones, on-screen buttons):
 *
 *   Inside the store:  W / ↑ forward, S / ↓ back, A / D step sideways,
 *                      ← / → turn, Shift to hurry.            (camera.tsx)
 *   Outside:           tap a parked car to get in, then W / ↑ gas,
 *                      S / ↓ brake and reverse, A / D or ← / → steer,
 *                      Space handbrake.                        (this file)
 */

/** Which movement keys (or on-screen buttons) are held down right now. */
export const input = {
  forward: false,
  back: false,
  /** A / D: step sideways when walking, steer when driving. */
  strafeLeft: false,
  strafeRight: false,
  /** ← / →: turn when walking, steer when driving. */
  turnLeft: false,
  turnRight: false,
  brake: false,
  run: false,
};

/** The car being driven, for the camera to follow. */
export const drive = {
  active: false,
  pos: new THREE.Vector3(),
  heading: 0,
  speed: 0,
};

const KEYS: Record<string, keyof typeof input> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "strafeLeft",
  KeyD: "strafeRight",
  ArrowLeft: "turnLeft",
  ArrowRight: "turnRight",
  Space: "brake",
  ShiftLeft: "run",
  ShiftRight: "run",
};

/** Is anything being pressed that moves you? */
export function moving() {
  return input.forward || input.back || input.strafeLeft || input.strafeRight || input.turnLeft || input.turnRight;
}

/**
 * Listens for the movement keys. Ignores typing in a text box, and keys held
 * with Ctrl / Cmd. `enabled` turns it all off (e.g. while a panel is open).
 */
export function useMovementKeys(enabled: boolean) {
  useEffect(() => {
    const clear = () => {
      for (const k of Object.keys(input) as (keyof typeof input)[]) input[k] = false;
    };
    if (!enabled) {
      clear();
      return;
    }
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return Boolean(t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)));
    };
    const down = (e: KeyboardEvent) => {
      const key = KEYS[e.code];
      if (!key || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
      // Space on a focused button should still press the button.
      if (e.code === "Space" && (e.target as HTMLElement | null)?.tagName === "BUTTON") return;
      e.preventDefault();
      input[key] = true;
    };
    const up = (e: KeyboardEvent) => {
      const key = KEYS[e.code];
      if (key) input[key] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [enabled]);
}

// ---- The cars ---------------------------------------------------------------------------------

const CAR_HALF_W = 1.7;
const TOP_SPEED = 24;
const REVERSE_SPEED = 9;

type CarState = { x: number; z: number; heading: number };

/** Two circles cover a car (front half and back half). */
function carCircles(c: CarState) {
  const fx = -Math.sin(c.heading);
  const fz = -Math.cos(c.heading);
  return [
    { x: c.x + fx * 1.75, z: c.z + fz * 1.75, r: CAR_HALF_W + 0.1 },
    { x: c.x - fx * 1.75, z: c.z - fz * 1.75, r: CAR_HALF_W + 0.1 },
  ];
}

/** Would the car hit something (the store, another car, a lamp post or a tree) here? */
function blocked(c: CarState, others: CarState[]) {
  const circles = carCircles(c);
  for (const p of circles) {
    // The store (and the planters and sidewalk right in front of it).
    if (p.x > -BUILDING.halfWidth - p.r && p.x < BUILDING.halfWidth + p.r && p.z > -BUILDING.depth - p.r && p.z < 2.6 + p.r) return true;
    // Way out in the grass: the edge of the world.
    if (Math.abs(p.x) > LOT_HALF + 60 || p.z > 95 || p.z < -BUILDING.depth - 60) return true;
    for (const [x, z] of LAMPS) if (Math.hypot(p.x - x, p.z - z) < p.r + 0.35) return true;
    for (const [x, z, s] of TREES) if (Math.hypot(p.x - x, p.z - z) < p.r + 0.6 * s) return true;
    for (const o of others) for (const q of carCircles(o)) if (Math.hypot(p.x - q.x, p.z - q.z) < p.r + q.r) return true;
  }
  return false;
}

/**
 * The parked cars. Tap one (from the drone view) to get in; while `driving`
 * is that car's number, it drives with the keys and the camera follows it.
 * Cars stay wherever you leave them.
 */
export function Cars({
  driving,
  canPick,
  calm,
  onPick,
  onBump,
}: {
  /** The car being driven (its number), or null. */
  driving: number | null;
  /** Cars can be tapped (you're outside, not flying anywhere). */
  canPick: boolean;
  calm: boolean;
  onPick: (car: number) => void;
  /** Hit something (for a little "bonk" message). */
  onBump?: () => void;
}) {
  // Where each car is now (they stay wherever you park them).
  const state = useRef<CarState[]>(PARKED_CARS.map((c) => ({ x: c.x, z: c.z, heading: c.turn })));
  const groups = useRef<(THREE.Group | null)[]>([]);
  const speed = useRef(0);
  const lean = useRef(0);
  const lastBump = useRef(0);

  useEffect(() => {
    drive.active = driving !== null;
    speed.current = 0;
    if (driving !== null) {
      const c = state.current[driving];
      drive.pos.set(c.x, 0, c.z);
      drive.heading = c.heading;
      drive.speed = 0;
    }
    return () => {
      drive.active = false;
    };
  }, [driving]);

  useFrame((frame, rawDelta) => {
    if (driving === null) return;
    const dt = Math.min(rawDelta, 0.1);
    const c = state.current[driving];
    let v = speed.current;

    // Gas, brake / reverse, coasting.
    if (input.forward) v += (v < 0 ? 30 : 13) * dt;
    else if (input.back) v -= (v > 0.3 ? 30 : 9) * dt;
    else v *= Math.exp(-0.9 * dt);
    if (input.brake) v *= Math.exp(-5 * dt);
    v = THREE.MathUtils.clamp(v, -REVERSE_SPEED, TOP_SPEED);
    if (Math.abs(v) < 0.04 && !input.forward && !input.back) v = 0;

    // Steering: turns faster the faster you go (up to a point), and the other way in reverse.
    const steer = Number(input.strafeLeft || input.turnLeft) - Number(input.strafeRight || input.turnRight);
    const turn = steer * 1.6 * THREE.MathUtils.clamp(v / 7, -1, 1) * dt;

    const next = { x: c.x - Math.sin(c.heading + turn) * v * dt, z: c.z - Math.cos(c.heading + turn) * v * dt, heading: c.heading + turn };
    const others = state.current.filter((_, i) => i !== driving);
    if (blocked(next, others)) {
      // Try just turning (so you can wiggle out), else bounce back a little.
      const turnOnly = { ...c, heading: next.heading };
      if (!blocked(turnOnly, others)) c.heading = turnOnly.heading;
      if (Math.abs(v) > 3 && frame.clock.elapsedTime - lastBump.current > 0.8) {
        lastBump.current = frame.clock.elapsedTime;
        onBump?.();
      }
      v *= -0.25;
    } else {
      Object.assign(c, next);
    }
    speed.current = v;

    // Lean a little into turns.
    lean.current = THREE.MathUtils.damp(lean.current, calm ? 0 : -steer * THREE.MathUtils.clamp(v / TOP_SPEED, -1, 1) * 0.06, 6, dt);

    const g = groups.current[driving];
    if (g) {
      g.position.set(c.x, 0, c.z);
      g.rotation.set(0, c.heading, lean.current);
    }
    drive.pos.set(c.x, 0, c.z);
    drive.heading = c.heading;
    drive.speed = v;
  });

  return (
    <group>
      {PARKED_CARS.map((car, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
            // Put it where it is now (set here, not as props, so a re-render never moves a car back).
            const c = state.current[i];
            g?.position.set(c.x, 0, c.z);
            g?.rotation.set(0, c.heading, 0);
          }}
          onClick={(e) => {
            if (!canPick || e.delta > 8) return;
            e.stopPropagation();
            onPick(i);
          }}
          onPointerOver={(e) => {
            if (!canPick) return;
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            if (canPick) document.body.style.cursor = "";
          }}
        >
          <Car color={car.color} position={[0, 0, 0]} />
          {/* An invisible box round the car to tap (the car's own parts ignore taps) */}
          <mesh position-y={1.6}>
            <boxGeometry args={[3.6, 3.2, 7.4]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** On-screen pedals and steering for phones (they set the same `input` as the keys). */
export function TouchPad({ mode }: { mode: "drive" | "walk" }) {
  const hold = (key: keyof typeof input) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      input[key] = true;
    },
    onPointerUp: () => (input[key] = false),
    onPointerCancel: () => (input[key] = false),
    onLostPointerCapture: () => (input[key] = false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const btn =
    "grid size-16 touch-none place-items-center rounded-2xl bg-black/70 font-heading text-2xl font-extrabold text-white shadow-lg backdrop-blur select-none active:scale-95 active:bg-black";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 flex items-end justify-between px-4 sm:hidden">
      <div className="pointer-events-auto flex gap-2">
        <button type="button" aria-label={mode === "drive" ? "Steer left" : "Turn left"} className={btn} {...hold("turnLeft")}>
          ◀
        </button>
        <button type="button" aria-label={mode === "drive" ? "Steer right" : "Turn right"} className={btn} {...hold("turnRight")}>
          ▶
        </button>
      </div>
      <div className="pointer-events-auto flex flex-col gap-2">
        <button type="button" aria-label={mode === "drive" ? "Gas" : "Walk forward"} className={btn} {...hold("forward")}>
          ▲
        </button>
        <button type="button" aria-label={mode === "drive" ? "Brake and reverse" : "Walk back"} className={btn} {...hold("back")}>
          ▼
        </button>
      </div>
    </div>
  );
}
