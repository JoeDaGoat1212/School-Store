"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { carBlocked, player, walkBlocked, type CarSpot } from "./bump";
import { CarModel, driverSeat } from "./car-model";
import { fleet, isAircraft, type Vehicle } from "./fleet";
import { useGameVersion } from "./game-events";
import { Humanoid, PELVIS_BELOW, PLAYER_LOOK, hipsHeight, newPose } from "./humanoid";
import { profile, saveProfile } from "./profile";
import { modelOf, specOf } from "./vehicles";
import { MPH_PER_UNIT, SMOKE_SLIP, stepCar, type Motion } from "./car-physics";
import { puff } from "./smoke";
import { walkerSpots } from "./town";
import { groundAt } from "./terrain";
import { life } from "./life";

/** Where a car sits on the ground: its height, and how far its nose tips up or down on a slope. */
export function carOnGround(x: number, z: number, heading: number) {
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  const front = groundAt(x + fx * 1.75, z + fz * 1.75);
  const back = groundAt(x - fx * 1.75, z - fz * 1.75);
  return { y: (front + back) / 2, pitch: Math.atan2(front - back, 3.5) };
}

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

/** Where the driven vehicle is and what it's doing, for the camera and the speedometer. */
export const drive = {
  active: false,
  pos: new THREE.Vector3(),
  heading: 0,
  /** Forward speed, units per second (negative when reversing). */
  speed: 0,
  gear: "P" as "P" | "D" | "R",
  braking: false,
  /** Where the camera sits behind it (planes and big things want it further back). */
  cam: { back: 12, up: 5.2 },
  /** The vehicle's top speed (mph), for the speedometer. */
  top: 100,
  /** Which fleet vehicle (fleet.ts), or -1. */
  vehicle: -1,
};

/** The driven car's motion: velocity (it can slide sideways a little) and steering. */
const motion: Motion = { vx: 0, vz: 0, steer: 0 };
/** Something's slowing the car down (a squad car ramming it): multiply its speed by k. */
export function slowCar(k: number) {
  motion.vx *= k;
  motion.vz *= k;
}

/**
 * The parked cars and bikes (fleet.ts). Walk up to one and press E (or tap
 * it) to get in; while `driving` is its number, it drives with the keys and
 * the camera follows it. They stay wherever you leave them. (Aircraft are
 * flight.tsx.)
 *
 * The physics (speed, brakes, steering, skids) is in car-physics.ts, with
 * each model's own top speed, pull and grip (vehicles.ts); this part moves
 * the car, stops it at walls, and lights it up.
 */
export function Cars({
  driving,
  canPick,
  calm,
  onPick,
  onBump,
}: {
  /** The vehicle being driven (its number), or null. */
  driving: number | null;
  /** The vehicle you're close enough to get into (it can be tapped), or null. */
  canPick: number | null;
  calm: boolean;
  onPick: (car: number) => void;
  /** Hit something (for a little "Bonk!" message). */
  onBump?: (text: string) => void;
}) {
  useGameVersion();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const riders = useRef<(THREE.Group | null)[]>([]);
  const lastBump = useRef(0);
  /** Puffs of smoke owed (smoke comes out at a steady rate, whatever the frame rate). */
  const smokeDue = useRef(0);
  const was = useRef<number | null>(null);
  // You, in the seat: on a bike, leaning forward with your hands on the bars; in a car, hands on the wheel.
  const bikePose = useMemo(() => ({ ...newPose(), sit: 0.8, aim: 1, lean: 0.7 }), []);
  const carPose = useMemo(() => ({ ...newPose(), sit: 1, aim: 0.5 }), []);

  useEffect(() => {
    const before = was.current;
    was.current = driving;
    motion.vx = motion.vz = motion.steer = 0;
    drive.speed = 0;
    drive.gear = "P";
    drive.braking = false;
    for (const v of fleet) {
      v.look.braking = v.look.reversing = false;
      v.look.steer = v.look.pitch = v.look.roll = 0;
    }
    if (driving !== null) {
      const v = fleet[driving];
      const c = v.spot;
      drive.pos.set(c.x, carOnGround(c.x, c.z, c.heading).y, c.z);
      drive.heading = c.heading;
      drive.active = true;
      drive.vehicle = driving;
      drive.top = modelOf(v.model).top;
      drive.cam = v.body === "plane" ? { back: 20, up: 6.5 } : v.body === "heli" ? { back: 17, up: 7 } : v.body === "moto" ? { back: 9, up: 4 } : v.body === "cart" ? { back: 9, up: 4.4 } : { back: 12, up: 5.2 };
      player.onFoot = false;
    } else {
      drive.active = false;
      drive.vehicle = -1;
      // Got out: step out by the driver's door (or wherever there's room). Aircraft handle their own (you might be in the air!).
      if (before !== null && !isAircraft(fleet[before])) {
        // (Not if you've just been taken to jail: you're in your cell, not beside the car.)
        if (!life.inJail) getOut(fleet[before].spot);
        rememberWhere(fleet[before]);
      }
    }
  }, [driving]);
  useEffect(
    () => () => {
      drive.active = false;
    },
    [],
  );

  // Parked cars far from the camera aren't drawn (there are a lot of them, and they're detailed).
  useFrame(({ camera }) => {
    groups.current.forEach((g, i) => {
      if (!g || i === driving) return;
      const s = fleet[i]?.spot;
      if (!s) return;
      g.visible = (s.x - camera.position.x) ** 2 + (s.z - camera.position.z) ** 2 < 240 * 240;
    });
  });
  useFrame((frame, rawDelta) => {
    if (driving === null || isAircraft(fleet[driving])) return;
    const dt = Math.min(rawDelta, 0.1);
    const v = fleet[driving];
    const c = v.spot;
    const look = v.look;
    const spec = specOf(v.model);
    const wheel = Number(input.strafeLeft || input.turnLeft) - Number(input.strafeRight || input.turnRight);
    const { heading, accel, yawRate, braking, reversing, slip } = stepCar(c, motion, { gas: input.forward, brake: input.back, handbrake: input.brake, wheel }, dt, spec);
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

    // ---- Tyre smoke from the back wheels while they slide (drifting, or skidding on the handbrake) ----
    const skidding = input.brake && Math.abs(fwdNow) > 6;
    const smoky = skidding ? 1 : Math.min(1, Math.max(0, (slip - SMOKE_SLIP) / 5));
    if (smoky > 0 && !calm) {
      smokeDue.current += (12 + 30 * smoky) * dt;
      const cos = Math.cos(c.heading);
      const sin = Math.sin(c.heading);
      while (smokeDue.current >= 1) {
        smokeDue.current -= 1;
        for (const lx of [-1.55, 1.55]) puff(c.x + lx * cos + 2.4 * sin, 0.4, c.z - lx * sin + 2.4 * cos, motion.vx, motion.vz);
      }
    }

    // ---- How it looks: wheels, lights, the body dipping and leaning ----
    look.spin += (fwdNow / 0.62) * dt;
    look.steer = motion.steer;
    look.braking = braking;
    look.reversing = reversing && fwdNow < -0.1;
    look.pitch = calm ? 0 : THREE.MathUtils.clamp(-accel * 0.0035, -0.05, 0.06);
    // Motorbikes lean into a turn; cars' bodies roll out of it. (yawRate > 0 is turning left, and +roll tips the top to the left.)
    look.roll = calm ? 0 : THREE.MathUtils.clamp(yawRate * Math.hypot(motion.vx, motion.vz) * (spec.moto ? 0.03 : -0.004), spec.moto ? -0.18 : -0.07, spec.moto ? 0.18 : 0.07);

    const g = groups.current[driving];
    const ground = carOnGround(c.x, c.z, c.heading);
    g?.position.set(c.x, ground.y, c.z);
    g?.rotation.set(ground.pitch, c.heading, 0, "YXZ");
    drive.pos.set(c.x, ground.y, c.z);
    drive.heading = c.heading;
    drive.speed = fwdNow;
    drive.braking = braking;
    drive.gear = look.reversing || (input.back && fwdNow <= 0.5) ? "R" : Math.abs(fwdNow) < 0.1 && !input.forward ? "P" : "D";
    // You're sitting in it (on a bike, on the seat).
    const rider = riders.current[driving];
    if (rider) rider.visible = true;
  });

  return (
    <group>
      {fleet.map((v, i) =>
        isAircraft(v) ? null : (
          <group
            key={v.id}
            ref={(g) => {
              groups.current[i] = g;
              // Put it where it is now (set here, not as props, so a re-render never moves a car back).
              const c = v.spot;
              const ground = carOnGround(c.x, c.z, c.heading);
              g?.position.set(c.x, ground.y, c.z);
              g?.rotation.set(ground.pitch, c.heading, 0, "YXZ");
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
            <CarModel color={v.color} look={v.look} body={v.body} rider={<Rider i={i} body={v.body} driving={driving === i} pose={v.body === "moto" ? bikePose : carPose} riders={riders} />} />
            {/* An invisible box round the car to tap (the car's own parts ignore taps) */}
            <mesh position-y={1.6}>
              <boxGeometry args={[v.body === "moto" ? 1.6 : 3.6, 3.2, 7.4]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        ),
      )}
    </group>
  );
}

/**
 * You, sitting in the driver's seat (or on a bike's seat): hips on the
 * cushion, feet down, hands on the wheel or the bars. In a car you're drawn a
 * little smaller so you fit under the roof. Inside the car's own model, so you
 * lean with the bike.
 */
function Rider({ i, body, driving, pose, riders }: { i: number; body: Vehicle["body"]; driving: boolean; pose: ReturnType<typeof newPose>; riders: React.RefObject<(THREE.Group | null)[]> }) {
  const seat = driverSeat(body);
  // (Bikes and golf carts are built to the size of the people; cars are a little small for them.)
  const k = body === "moto" || body === "cart" ? 1 : 0.55;
  return (
    <group
      ref={(g) => {
        riders.current[i] = g;
      }}
      visible={driving}
      position={[seat.x, seat.y + (PELVIS_BELOW - hipsHeight(pose.sit)) * k, seat.z]}
      // (People face +z; vehicles face -z.)
      rotation-y={Math.PI}
      scale={k}
    >
      <Humanoid look={PLAYER_LOOK} pose={pose} />
    </group>
  );
}

/** Remember where you left a car you own (it'll be there next time). */
function rememberWhere(v: Vehicle) {
  if (!v.owned) return;
  const saved = profile.cars.find((c) => c.id === v.id);
  if (saved) Object.assign(saved, { x: Math.round(v.spot.x * 10) / 10, z: Math.round(v.spot.z * 10) / 10, heading: Math.round(v.spot.heading * 100) / 100 });
  saveProfile();
}

/** Step out of a car: by the driver's door if there's room, else the other door, the back or the front. */
export function getOut(c: CarSpot) {
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
