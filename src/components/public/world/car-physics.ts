/*
 * How a car drives: a simple version of real car physics, as plain math (no
 * 3D code), so it can be tested on its own (car-physics.test.ts).
 *
 *   - The engine pulls hard from a standstill and less and less near the
 *     top speed (100 mph).
 *   - The brakes stop you much faster than the engine speeds you up.
 *   - Holding brake once you've stopped puts it in reverse.
 *   - Steering turns the front wheels. The faster you go, the less they
 *     turn, and the tyres can only grip so much, so a normal turn at
 *     100 mph is a wide one.
 *   - Drifting: pull the handbrake (Space) while you turn, or floor it and
 *     steer hard at speed, and the back steps out. The car swings round
 *     while it slides; steer to hold the slide, steer the other way
 *     (counter-steer) or let go to straighten up. Sliding tyres smoke.
 *
 * Distances are scene units (about a metre); speeds are units per second.
 */

/** Units per second → miles per hour. */
export const MPH_PER_UNIT = 2.2;
/** Flat out: 100 mph. */
export const TOP = 100 / MPH_PER_UNIT;
export const REVERSE_TOP = 9;
const ENGINE = 10; // how hard the engine pulls from a standstill (units/s²)
const REVERSE_PULL = 6;
export const BRAKES = 24; // how hard the brakes stop you (units/s²)
const HANDBRAKE = 6;
const WHEELBASE = 4.5; // front wheels to back wheels
const GRIP = 15; // the most sideways push the tyres take before sliding (units/s²)
const MAX_LOCK = 0.75; // how far the front wheels turn (radians), standing still
/** How fast the car can swing round while it's sliding (radians a second). */
const DRIFT_TURN = 2.4;
/** Floor it and steer hard above this speed and the back steps out by itself. */
const POWER_SLIDE = 26;
/** How sideways (units/s) the tyres are sliding before they smoke. */
export const SMOKE_SLIP = 2.5;

/** Where a car is and which way it faces (its front is toward -z when heading is 0). */
export type Pose = { x: number; z: number; heading: number };
/** How a car is moving: its velocity (it can slide a little sideways) and how far the front wheels are turned. */
export type Motion = { vx: number; vz: number; steer: number };
/** The driver's controls. `wheel` is -1 (right) … 1 (left). */
export type Pedals = { gas: boolean; brake: boolean; handbrake: boolean; wheel: number };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const damp = (from: number, to: number, rate: number, dt: number) => to + (from - to) * Math.exp(-rate * dt);

/** The car's speed along the way it's facing (negative = backwards). */
export function forwardSpeed(pose: Pose, motion: Motion) {
  return motion.vx * -Math.sin(pose.heading) + motion.vz * -Math.cos(pose.heading);
}

/**
 * One small step of driving. Updates `motion` (in place) and returns where
 * the car would be after `dt` seconds, plus what it's doing (for the lights
 * and the body lean). It doesn't check for walls: the caller does that.
 */
/** What one vehicle can do (dealership cars are faster, motorbikes grip more). Leave it out for an ordinary car. */
export type Spec = { top: number; engine: number; grip: number };

export function stepCar(pose: Pose, motion: Motion, pedals: Pedals, dt: number, spec?: Spec) {
  const top = spec?.top ?? TOP;
  const engine = spec?.engine ?? ENGINE;
  const grip = spec?.grip ?? GRIP;
  const fx = -Math.sin(pose.heading);
  const fz = -Math.cos(pose.heading);
  // Split the velocity into forward and sideways (to the car's right).
  let fwd = motion.vx * fx + motion.vz * fz;
  let side = motion.vx * -fz + motion.vz * fx;

  // ---- Gas, brakes, reverse ----
  let braking = false;
  let reversing = false;
  let accel: number;
  if (pedals.gas) {
    if (fwd < -0.5) {
      accel = BRAKES; // rolling backwards: brake first
      braking = true;
    } else accel = engine * Math.max(0, 1 - (fwd / top) ** 2) + 0.4;
  } else if (pedals.brake) {
    if (fwd > 0.5) {
      accel = -BRAKES;
      braking = true;
    } else {
      accel = -REVERSE_PULL * Math.max(0, 1 - (fwd / -REVERSE_TOP) ** 2);
      reversing = true;
    }
  } else {
    // Coasting: the road and the air slow you down.
    accel = -Math.sign(fwd) * (0.6 + 0.0018 * fwd * fwd);
  }
  if (pedals.handbrake) {
    accel = -Math.sign(fwd) * HANDBRAKE;
    braking = true;
  }
  const next = fwd + accel * dt;
  // Coasting or the handbrake stops you; it doesn't send you backwards.
  const stops = (!pedals.gas && !pedals.brake) || pedals.handbrake;
  fwd = stops && Math.sign(next) !== Math.sign(fwd) ? 0 : next;
  if (!pedals.gas && !pedals.brake && Math.abs(fwd) < 0.15) fwd = 0;
  fwd = clamp(fwd, -REVERSE_TOP, top);

  // ---- Steering ----
  // Less lock the faster you go.
  const maxSteer = MAX_LOCK / (1 + Math.abs(fwd) / 16);
  motion.steer = damp(motion.steer, clamp(pedals.wheel, -1, 1) * maxSteer, 8, dt);
  /** How far the wheel is turned, -1 … 1 (smoothed). */
  const turned = motion.steer / maxSteer;
  let yawRate = (fwd * Math.tan(motion.steer)) / WHEELBASE;

  // Drifting? Handbrake while moving, flooring it with the wheel hard over at
  // speed, or keeping on the gas and steering while already sideways.
  const sideways = Math.abs(side) > 1.5;
  const drifting =
    (pedals.handbrake && Math.abs(fwd) > 4) ||
    (pedals.gas && Math.abs(turned) > 0.8 && fwd > POWER_SLIDE) ||
    (sideways && pedals.gas && pedals.wheel !== 0 && fwd > 6);
  if (drifting) {
    // The back is loose: the car swings round as far as you steer it
    // (no steering = it just slides; steering the other way straightens it).
    yawRate = turned * DRIFT_TURN * Math.min(1, Math.abs(fwd) / 8) * Math.sign(fwd);
  } else {
    // The tyres can only push so hard sideways: at speed, only wide turns.
    const most = grip / Math.max(Math.abs(fwd), 1);
    yawRate = clamp(yawRate, -most, most);
  }
  const heading = pose.heading + yawRate * dt;

  // The car turns, but its weight wants to keep going the old way: see how
  // the old velocity lines up with the new heading...
  const vx = fx * fwd + -fz * side;
  const vz = fz * fwd + fx * side;
  const nfx = -Math.sin(heading);
  const nfz = -Math.cos(heading);
  fwd = vx * nfx + vz * nfz;
  side = vx * -nfz + vz * nfx;
  // ...then the tyres pull it back in line: hardly at all while drifting,
  // gently while coming out of a slide, firmly the rest of the time.
  side *= Math.exp(-(drifting ? (pedals.handbrake ? 0.8 : 1.6) : sideways ? 5 : 12) * dt);
  motion.vx = nfx * fwd + -nfz * side;
  motion.vz = nfz * fwd + nfx * side;

  return { x: pose.x + motion.vx * dt, z: pose.z + motion.vz * dt, heading, accel, yawRate, braking, reversing, drifting, slip: Math.abs(side) };
}
