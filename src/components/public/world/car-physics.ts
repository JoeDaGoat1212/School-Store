/*
 * How a car drives: a simple version of real car physics, as plain math (no
 * 3D code), so it can be tested on its own (car-physics.test.ts).
 *
 *   - The engine pulls hard from a standstill and less and less near the
 *     top speed (100 mph).
 *   - The brakes stop you much faster than the engine speeds you up.
 *   - Holding brake once you've stopped puts it in reverse.
 *   - Steering turns the front wheels. The faster you go, the less they
 *     turn, and the tyres can only grip so much, so you can't take a sharp
 *     corner at 100 mph: slow down first!
 *   - The handbrake (Space) locks the back wheels: the car skids and slides.
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
const HANDBRAKE = 12;
const WHEELBASE = 4.5; // front wheels to back wheels
const GRIP = 10; // the most sideways push the tyres take before sliding (units/s²)

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
export function stepCar(pose: Pose, motion: Motion, pedals: Pedals, dt: number) {
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
    } else accel = ENGINE * Math.max(0, 1 - (fwd / TOP) ** 2) + 0.4;
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
  fwd = clamp(fwd, -REVERSE_TOP, TOP);

  // ---- Steering ----
  // Less lock the faster you go.
  const maxSteer = 0.6 / (1 + Math.abs(fwd) / 12);
  motion.steer = damp(motion.steer, clamp(pedals.wheel, -1, 1) * maxSteer, 6, dt);
  let yawRate = (fwd * Math.tan(motion.steer)) / WHEELBASE;
  // The tyres can only push so hard sideways: at speed, only wide turns.
  const most = (pedals.handbrake ? GRIP * 1.6 : GRIP) / Math.max(Math.abs(fwd), 1);
  yawRate = clamp(yawRate, -most, most);
  const heading = pose.heading + yawRate * dt;

  // The car turns, but its weight wants to keep going the old way: see how
  // the old velocity lines up with the new heading...
  const vx = fx * fwd + -fz * side;
  const vz = fz * fwd + fx * side;
  const nfx = -Math.sin(heading);
  const nfz = -Math.cos(heading);
  fwd = vx * nfx + vz * nfz;
  side = vx * -nfz + vz * nfx;
  // ...then the tyres pull it back in line (only weakly on the handbrake: a skid).
  side *= Math.exp(-(pedals.handbrake && Math.abs(fwd) > 4 ? 1.1 : 12) * dt);
  motion.vx = nfx * fwd + -nfz * side;
  motion.vz = nfz * fwd + nfx * side;

  return { x: pose.x + motion.vx * dt, z: pose.z + motion.vz * dt, heading, accel, yawRate, braking, reversing };
}
