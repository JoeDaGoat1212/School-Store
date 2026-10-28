import { describe, expect, it } from "vitest";
import { forwardSpeed, MPH_PER_UNIT, REVERSE_TOP, stepCar, type Motion, type Pedals, type Pose } from "./car-physics";

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

  it("turns left with the left key, and tightly only when slow", () => {
    const slow = fresh();
    run(slow.pose, slow.motion, { gas: true }, 1);
    run(slow.pose, slow.motion, { wheel: 1 }, 1.5);
    // Facing -z, left is -x.
    expect(slow.pose.x).toBeLessThan(-1);
    expect(slow.pose.heading).toBeGreaterThan(0.3);

    const fast = fresh();
    run(fast.pose, fast.motion, { gas: true }, 25);
    const before = fast.pose.heading;
    run(fast.pose, fast.motion, { gas: true, wheel: 1 }, 1);
    // At ~100 mph the tyres only manage a gentle curve.
    const turned = fast.pose.heading - before;
    expect(turned).toBeGreaterThan(0.05);
    expect(turned).toBeLessThan(0.3);
  });

  it("skids on the handbrake: the car slides sideways for a moment", () => {
    const { pose, motion } = fresh();
    run(pose, motion, { gas: true }, 3);
    run(pose, motion, { handbrake: true, wheel: 1 }, 0.4);
    const sideways = Math.abs(motion.vx * Math.cos(pose.heading) - motion.vz * Math.sin(pose.heading));
    expect(sideways).toBeGreaterThan(1);
    run(pose, motion, { handbrake: true }, 5);
    expect(Math.hypot(motion.vx, motion.vz)).toBeLessThan(0.01);
  });
});
