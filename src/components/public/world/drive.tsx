"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { carBlocked, parkedSpots, player, walkBlocked, type CarSpot } from "./bump";
import { CarModel, newLook } from "./car-model";
import { MPH_PER_UNIT, stepCar, type Motion } from "./car-physics";
import { PARKED_CARS } from "./exterior";
import { walkerSpots } from "./town";

/*
 * Moving around with the keyboard (and, on phones, on-screen buttons):
 *
 *   Inside the store:  W / ↑ forward, S / ↓ back, A / D step sideways,
 *                      ← / → turn, Shift to hurry.            (camera.tsx)
 *   Outside:           the same keys walk you round the parking lot and
 *                      the town. Walk up to a car and press E to get in.
 *   Driving:           W / ↑ gas, S / ↓ brake (hold to reverse),
 *                      A / D or ← / → steer, Space handbrake, E get out.
 *                                                              (this file)
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
export { MPH_PER_UNIT };

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

const WHEEL_R = 0.75;

/** Where the driven car is and what it's doing, for the camera and the speedometer. */
export const drive = {
  active: false,
  pos: new THREE.Vector3(),
  heading: 0,
  /** Forward speed, units per second (negative when reversing). */
  speed: 0,
  gear: "P" as "P" | "D" | "R",
  braking: false,
};

/** Each parked car's wheels and lights (one per car). */
const LOOKS = PARKED_CARS.map(newLook);
/** The driven car's motion: velocity (it can slide sideways a little) and steering. */
const motion: Motion = { vx: 0, vz: 0, steer: 0 };

/**
 * The parked cars. Walk up to one and press E (or tap it) to get in; while
 * `driving` is that car's number, it drives with the keys and the camera
 * follows it. Cars stay wherever you leave them.
 *
 * The car physics (speed, brakes, steering, skids) is in car-physics.ts;
 * this part moves the car, stops it at walls, and lights it up.
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
  /** The car you're close enough to get into (it can be tapped), or null. */
  canPick: number | null;
  calm: boolean;
  onPick: (car: number) => void;
  /** Hit something (for a little "Bonk!" message). */
  onBump?: (text: string) => void;
}) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const lastBump = useRef(0);
  const was = useRef<number | null>(null);

  useEffect(() => {
    const before = was.current;
    was.current = driving;
    motion.vx = motion.vz = motion.steer = 0;
    drive.speed = 0;
    drive.gear = "P";
    drive.braking = false;
    for (const l of LOOKS) {
      l.braking = l.reversing = false;
      l.steer = l.pitch = l.roll = 0;
    }
    if (driving !== null) {
      const c = parkedSpots[driving];
      drive.pos.set(c.x, 0, c.z);
      drive.heading = c.heading;
      drive.active = true;
      player.onFoot = false;
    } else {
      drive.active = false;
      // Got out: step out by the driver's door (or wherever there's room).
      if (before !== null) getOut(parkedSpots[before]);
    }
  }, [driving]);
  useEffect(
    () => () => {
      drive.active = false;
    },
    [],
  );

  useFrame((frame, rawDelta) => {
    if (driving === null) return;
    const dt = Math.min(rawDelta, 0.1);
    const c = parkedSpots[driving];
    const look = LOOKS[driving];
    const wheel = Number(input.strafeLeft || input.turnLeft) - Number(input.strafeRight || input.turnRight);
    const { heading, accel, yawRate, braking, reversing } = stepCar(c, motion, { gas: input.forward, brake: input.back, handbrake: input.brake, wheel }, dt);

    // ---- Move, unless something's in the way ----
    const people = walkerSpots;
    const moved = { x: c.x + motion.vx * dt, z: c.z + motion.vz * dt, heading };
    if (!carBlocked(moved, c, people)) Object.assign(c, moved);
    else {
      const speed = Math.hypot(motion.vx, motion.vz);
      // Slide along whatever you hit, if you can.
      const alongX = { x: moved.x, z: c.z, heading };
      const alongZ = { x: c.x, z: moved.z, heading };
      if (!carBlocked(alongX, c, people)) {
        Object.assign(c, alongX);
        motion.vz = 0;
      } else if (!carBlocked(alongZ, c, people)) {
        Object.assign(c, alongZ);
        motion.vx = 0;
      } else {
        if (!carBlocked({ ...c, heading }, c, people)) c.heading = heading;
        // Bounce back a little.
        motion.vx *= -0.25;
        motion.vz *= -0.25;
      }
      const now = frame.clock.elapsedTime;
      if (speed > 3 && now - lastBump.current > 0.8) {
        lastBump.current = now;
        onBump?.(speed * MPH_PER_UNIT > 30 ? "Crash! 💥" : "Bonk!");
      }
    }
    const fwdNow = motion.vx * -Math.sin(c.heading) + motion.vz * -Math.cos(c.heading);

    // ---- How it looks: wheels, lights, the body dipping and leaning ----
    look.spin += (fwdNow / WHEEL_R) * dt;
    look.steer = motion.steer;
    look.braking = braking;
    look.reversing = reversing && fwdNow < -0.1;
    look.pitch = calm ? 0 : THREE.MathUtils.clamp(-accel * 0.0035, -0.05, 0.06);
    look.roll = calm ? 0 : THREE.MathUtils.clamp(yawRate * fwdNow * 0.004, -0.06, 0.06);

    const g = groups.current[driving];
    g?.position.set(c.x, 0, c.z);
    g?.rotation.set(0, c.heading, 0);
    drive.pos.set(c.x, 0, c.z);
    drive.heading = c.heading;
    drive.speed = fwdNow;
    drive.braking = braking;
    drive.gear = look.reversing || (input.back && fwdNow <= 0.5) ? "R" : Math.abs(fwdNow) < 0.1 && !input.forward ? "P" : "D";
  });

  return (
    <group>
      {PARKED_CARS.map((car, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
            // Put it where it is now (set here, not as props, so a re-render never moves a car back).
            const c = parkedSpots[i];
            g?.position.set(c.x, 0, c.z);
            g?.rotation.set(0, c.heading, 0);
          }}
          onClick={(e) => {
            if (canPick !== i || e.delta > 8) return;
            e.stopPropagation();
            onPick(i);
          }}
          onPointerOver={(e) => {
            if (canPick !== i) return;
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <CarModel color={car.color} look={LOOKS[i]} />
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

/** Step out of a car: by the driver's door if there's room, else the other door, the back or the front. */
function getOut(c: CarSpot) {
  // Spots round the car, in the car's own directions (x = right, z = back).
  const spots: [number, number][] = [
    [-3.2, -0.6],
    [3.2, -0.6],
    [0, 5.6],
    [0, -5.6],
    [-3.4, 3],
    [3.4, 3],
  ];
  const cos = Math.cos(c.heading);
  const sin = Math.sin(c.heading);
  for (const [lx, lz] of spots) {
    const x = c.x + lx * cos + lz * sin;
    const z = c.z - lx * sin + lz * cos;
    if (!walkBlocked(x, z, [])) {
      Object.assign(player, { x, z, yaw: -c.heading, hop: true, onFoot: true });
      return;
    }
  }
  // Boxed in: climb out the roof, as it were.
  Object.assign(player, { x: c.x - 3.2 * cos, z: c.z + 3.2 * sin, yaw: -c.heading, hop: true, onFoot: true });
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
