import { describe, expect, it } from "vitest";
import { forwardSpeed, MPH_PER_UNIT, REVERSE_TOP, SMOKE_SLIP, stepCar, type Motion, type Pedals, type Pose } from "./car-physics";

/** Drive for `seconds` with the same pedals, 60 steps a second. */
function run(pose: Pose, motion: Motion, pedals: Partial<Pedals>, seconds: number) {
  const p: Pedals = { gas: false, brake: false, handbrake: false, wheel: 0, ...pedals };
  let out = { ...pose, braking: false, reversing: false };
  for (let t = 0; t < seconds; t += 1 / 60) {
    const s = stepCar(pose, motion, p, 1 / 60);
    pose.x = s.x;
    pose.z = s.z;
    pose.heading = s.heading;
    out = { ...pose, braking: s.braking, reversing: s.reversing };
  }
  return out;
}
/** One step; returns how fast the tyres are sliding sideways. */
function stepAndSlip(pose: Pose, motion: Motion, pedals: Partial<Pedals>) {
  const s = stepCar(pose, motion, { gas: false, brake: false, handbrake: false, wheel: 0, ...pedals }, 1 / 60);
  Object.assign(pose, { x: s.x, z: s.z, heading: s.heading });
  return s.slip;
}
const mph = (pose: Pose, m: Motion) => forwardSpeed(pose, m) * MPH_PER_UNIT;
const fresh = () => ({ pose: { x: 0, z: 0, heading: 0 }, motion: { vx: 0, vz: 0, steer: 0 } });

describe("car physics", () => {
  it("speeds up quickly at first, then reaches exactly 100 mph and no more", () => {
    const { pose, motion } = fresh();
    run(pose, motion, { gas: true }, 3);
    const after3 = mph(pose, motion);
    expect(after3).toBeGreaterThan(45);
    expect(after3).toBeLessThan(70);
    run(pose, motion, { gas: true }, 30);
    expect(mph(pose, motion)).toBeCloseTo(100, 1);
    // Driving forward goes toward -z.
    expect(pose.z).toBeLessThan(-500);
    expect(Math.abs(pose.x)).toBeLessThan(0.01);
  });

  it("brakes much harder than it speeds up, with the brake lights on", () => {
    const { pose, motion } = fresh();
    run(pose, motion, { gas: true }, 30);
    let stopped = 0;
    let lit = true;
    for (let i = 0; i < 600 && forwardSpeed(pose, motion) > 0.01; i++) {
      const s = run(pose, motion, { brake: true }, 1 / 60);
      if (forwardSpeed(pose, motion) > 0.5) lit &&= s.braking;
      stopped = i / 60;
    }
    expect(lit).toBe(true);
    // 100 mph to a stop in about 2 seconds.
    expect(stopped).toBeGreaterThan(1.5);
    expect(stopped).toBeLessThan(2.5);
  });

  it("coasts slowly to a stop without going backwards", () => {
    const { pose, motion } = fresh();
    run(pose, motion, { gas: true }, 4);
    run(pose, motion, {}, 60);
    expect(forwardSpeed(pose, motion)).toBe(0);
  });

  it("holding the brake when stopped reverses (slowly), with the reverse lights on", () => {
    const { pose, motion } = fresh();
    const s = run(pose, motion, { brake: true }, 5);
    expect(s.reversing).toBe(true);
    expect(forwardSpeed(pose, motion)).toBeLessThan(-REVERSE_TOP * 0.9);
    expect(forwardSpeed(pose, motion)).toBeGreaterThanOrEqual(-REVERSE_TOP);
    expect(pose.z).toBeGreaterThan(0);
  });

  it("turns left with the left key, and sharply when slow", () => {
    const slow = fresh();
    run(slow.pose, slow.motion, { gas: true }, 0.8);
    run(slow.pose, slow.motion, { wheel: 1 }, 1.5);
    // Facing -z, left is -x.
    expect(slow.pose.x).toBeLessThan(-1);
    // Most of a quarter turn in a second and a half, while slowing down.
    expect(slow.pose.heading).toBeGreaterThan(1.1);

    // Coasting at ~100 mph (no gas, no handbrake: no drift), the tyres only manage a wide curve.
    const fast = fresh();
    run(fast.pose, fast.motion, { gas: true }, 25);
    const before = fast.pose.heading;
    run(fast.pose, fast.motion, { wheel: 1 }, 1);
    const turnedFast = fast.pose.heading - before;
    expect(turnedFast).toBeGreaterThan(0.1);
    expect(turnedFast).toBeLessThan(0.45);
  });

  /** The angle between where the car points and where it's going. */
  const slipAngle = (pose: Pose, m: Motion) => {
    const travel = Math.atan2(-m.vx, -m.vz);
    return Math.abs(((pose.heading - travel + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  };

  it("drifts on the handbrake: swings round while sliding, with smoke", () => {
    const { pose, motion } = fresh();
    run(pose, motion, { gas: true }, 3);
    let smoked = false;
    for (let i = 0; i < 30; i++) {
      const slip = stepAndSlip(pose, motion, { handbrake: true, gas: true, wheel: 1 });
      if (slip > SMOKE_SLIP) smoked = true;
    }
    expect(smoked).toBe(true);
    expect(slipAngle(pose, motion)).toBeGreaterThan(0.3);
    // Let go and counter-steer: it straightens up and grips again.
    run(pose, motion, { gas: true, wheel: -1 }, 0.3);
    run(pose, motion, { gas: true }, 2);
    expect(slipAngle(pose, motion)).toBeLessThan(0.05);
    // The handbrake on its own stops the car in the end.
    run(pose, motion, { handbrake: true }, 10);
    expect(Math.hypot(motion.vx, motion.vz)).toBeLessThan(0.01);
  });

  it("power slides: floor it and steer hard at speed and the back steps out", () => {
    const { pose, motion } = fresh();
    run(pose, motion, { gas: true }, 6);
    run(pose, motion, { gas: true, wheel: 1 }, 0.8);
    expect(slipAngle(pose, motion)).toBeGreaterThan(0.25);
  });
});
