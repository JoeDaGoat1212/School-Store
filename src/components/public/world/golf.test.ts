import { describe, expect, it } from "vitest";
import { BAG, CUP, PUTTER, carryOf, playOut, puttSpeed, rollBall, speedFor, strike } from "./golf-physics";
import { HOLES, PAR, SURF, YARD, golfHeight, outOfBounds, surfaceAt, teeSpot, waterAt, type Surface } from "./golf-course";
import type { Ground } from "./golf-physics";

// A flat fairway, for checking the clubs on their own.
const flat: Ground = { height: () => 0, slope: () => ({ sx: 0, sz: 0 }), surface: () => SURF.fairway as Surface };
const green: Ground = { height: () => 0, slope: () => ({ sx: 0, sz: 0 }), surface: () => SURF.green as Surface };

describe("the course", () => {
  it("is nine holes, par 37, mostly 4s and 5s with a couple of 3s", () => {
    expect(HOLES).toHaveLength(9);
    expect(PAR).toBe(37);
    const count = (p: number) => HOLES.filter((h) => h.par === p).length;
    expect(count(3)).toBe(2);
    expect(count(4) + count(5)).toBe(7);
    expect(count(5)).toBeGreaterThanOrEqual(3);
  });

  it("has real yardages for each par", () => {
    for (const h of HOLES) {
      if (h.par === 3) expect(h.yards).toBeLessThan(250);
      if (h.par === 4) expect(h.yards).toBeGreaterThan(330);
      if (h.par === 4) expect(h.yards).toBeLessThan(470);
      if (h.par === 5) expect(h.yards).toBeGreaterThan(470);
    }
  });

  it("puts every tee on a tee box and every pin on its green, in bounds", () => {
    for (const h of HOLES) {
      const t = teeSpot(h);
      expect(surfaceAt(t.x, t.z)).toBe(SURF.tee);
      expect(surfaceAt(h.pin.x, h.pin.z)).toBe(SURF.green);
      expect(outOfBounds(t.x, t.z)).toBe(false);
      expect(outOfBounds(h.pin.x, h.pin.z)).toBe(false);
      expect(waterAt(h.pin.x, h.pin.z)).toBeNull();
    }
  });

  it("has elevation change, water and bunkers", () => {
    const heights = HOLES.flatMap((h) => h.pts.map((p) => golfHeight(p.x, p.z)));
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(8);
    expect(HOLES.filter((h) => h.pts.some((p) => surfaceAt(p.x, p.z) === SURF.water)).length).toBeGreaterThan(0);
    for (const h of HOLES) for (const b of h.bunkers) expect(surfaceAt(b.x, b.z)).toBe(SURF.bunker);
  });
});

describe("the clubs", () => {
  const carry = (id: string, power = 1) => {
    const c = BAG.find((b) => b.id === id)!;
    return carryOf(speedFor(c.carry * YARD * power, c.launch, c.spin), c.launch, c.spin) / YARD;
  };

  it("carry their stock yardages with a full swing", () => {
    for (const club of BAG) if (!club.putter) expect(Math.abs(carry(club.id) - club.carry)).toBeLessThan(3);
  });

  it("go shorter with a softer swing, and a driver goes much further than a wedge", () => {
    expect(carry("7i", 0.7)).toBeLessThan(carry("7i") * 0.8);
    expect(carry("D")).toBeGreaterThan(carry("PW") * 1.7);
  });

  it("fly a well-struck shot straight down the line, and land it on a flat fairway", () => {
    const shot = strike(BAG[0], 1, 0, 1, { x: 0, y: 0, z: 0 }, SURF.tee, () => 0.25);
    const { ball } = playOut(shot.ball, flat);
    expect(Math.abs(ball.x)).toBeLessThan(15);
    expect(ball.z / YARD).toBeGreaterThan(250);
    expect(ball.z / YARD).toBeLessThan(300);
  });
});

describe("putting", () => {
  it("drops a putt hit at the right speed on the line", () => {
    const putter = BAG[PUTTER];
    expect(putter.putter).toBe(true);
    for (const yards of [3, 10, 25]) {
      const d = yards * YARD;
      // Just firm enough to reach the hole and a little past.
      const ball = rollBall(0, 0, 0, 0, 1, puttSpeed(d + 0.3));
      const out = playOut(ball, green, undefined, { x: 0, z: d });
      expect(out.ball.phase).toBe("holed");
    }
  });

  it("knows how big the cup is", () => {
    expect(CUP).toBeGreaterThan(0.05);
    expect(CUP).toBeLessThan(0.12);
  });
});
