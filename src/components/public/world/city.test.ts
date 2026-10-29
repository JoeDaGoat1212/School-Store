import { describe, expect, it } from "vitest";
import { CITY_PARKED, JEWELRY, LOOT, TOWERS, hitsCity, inBank, inJewelry, inVault, toWorld } from "./city-layout";
import { BANK_SITE, JEWELRY_SITE, inCity } from "./city-plan";
import { DELIVER_TIME, game, heistBlocks, jewelryLasers, rob, tick } from "./heist";
import { player } from "./you";
import { life } from "./life";
import { profile } from "./profile";
import { CURB, HOUSES, INTERSECTIONS, LOOPS, ROAD_HALF, ROADS, SIDEWALKS, WALKERS } from "./town-layout";

/* The city's layout (no towers on roads, the bank and shop can be walked into) and a robbery from start to finish. */

const J = (lx: number, lz: number) => toWorld(JEWELRY, lx, lz);
const blocked = (p: { x: number; z: number }) => hitsCity(p.x, p.z, 0.9) || heistBlocks(p.x, p.z, 0.9);
/** Can you walk in a straight line through these points? */
function walkable(...pts: { x: number; z: number }[]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
    for (let k = 0; k <= n; k++) if (blocked({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })) return false;
  }
  return true;
}
const you = (p: { x: number; z: number }, y = 0) => ({ x: p.x, z: p.z, y, onFoot: true, driving: false });

describe("the city's layout", () => {
  it("has no houses, and lots of people on its sidewalks", () => {
    expect(HOUSES.some((h) => inCity(h.x, h.z))).toBe(false);
    expect(WALKERS.filter((w) => inCity(w.strip.x1, w.strip.z1)).length).toBeGreaterThan(100);
  });

  it("keeps sidewalks out of the crossroads", () => {
    const bad = SIDEWALKS.filter((s) =>
      INTERSECTIONS.some((p) =>
        s.z1 === s.z2
          ? p.x > Math.min(s.x1, s.x2) + 1 && p.x < Math.max(s.x1, s.x2) - 1 && Math.abs(p.z - s.z1) < CURB
          : p.z > Math.min(s.z1, s.z2) + 1 && p.z < Math.max(s.z1, s.z2) - 1 && Math.abs(p.x - s.x1) < CURB,
      ),
    );
    expect(bad).toEqual([]);
  });

  it("keeps the traffic on the roads", () => {
    const off = LOOPS.flat().filter((p) => !ROADS.some((r) => Math.abs((r.axis === "x" ? p.z : p.x) - r.at) <= ROAD_HALF && (r.axis === "x" ? p.x : p.z) >= r.from - 1 && (r.axis === "x" ? p.x : p.z) <= r.to + 1));
    expect(off).toEqual([]);
  });

  it("has massive towers, none on a road, a sidewalk, each other or the bank and shop", () => {
    expect(Math.max(...TOWERS.map((t) => t.tiers[t.tiers.length - 1].y1))).toBeGreaterThanOrEqual(300);
    const bases = TOWERS.map((t) => t.tiers[0]);
    for (const b of bases) {
      for (const r of ROADS) {
        const across = r.axis === "x" ? b.z : b.x;
        const half = r.axis === "x" ? b.d / 2 : b.w / 2;
        const along = r.axis === "x" ? b.x : b.z;
        expect(Math.abs(across - r.at) < CURB + half && along > r.from - 50 && along < r.to + 50).toBe(false);
      }
      for (const s of [
        { x: BANK_SITE.x, z: BANK_SITE.front - BANK_SITE.d / 2, w: BANK_SITE.w + 4, d: BANK_SITE.d + 10 },
        { x: JEWELRY_SITE.x, z: JEWELRY_SITE.front + JEWELRY_SITE.d / 2, w: JEWELRY_SITE.w + 4, d: JEWELRY_SITE.d + 8 },
        ...bases.filter((o) => o !== b),
      ])
        expect(Math.abs(b.x - s.x) < (b.w + s.w) / 2 && Math.abs(b.z - s.z) < (b.d + s.d) / 2).toBe(false);
    }
  });

  it("puts every bit of loot inside its building (the bank's in the vault)", () => {
    for (const l of LOOT) expect(l.site === "bank" ? inBank(l.x, l.z) && inVault(l.x, l.z) : inJewelry(l.x, l.z)).toBe(true);
  });

  it("lets you walk into the jewelry shop and up to its cases (but not through its walls)", () => {
    expect(walkable(J(0, 14), J(0, -3), J(-7.5, -6), J(-7.5, -18))).toBe(true);
    expect(blocked(J(14.6, -10))).toBe(true);
  });

  it("never locks you inside a shop that's closed after a robbery", () => {
    game.sites.jewelry.closedUntil = Date.now() + 60_000;
    game.wallClock = Date.now();
    const out = J(0, 3);
    const door = J(0, -0.4);
    Object.assign(player, J(0, -4));
    expect(blocked(door)).toBe(false);
    Object.assign(player, out);
    expect(blocked(door)).toBe(true);
    game.sites.jewelry.closedUntil = 0;
  });

  it("leaves room round the getaway cars", () => {
    for (const c of CITY_PARKED) for (const d of [1.75, -1.75]) expect(hitsCity(c.x - Math.sin(c.turn) * d, c.z - Math.cos(c.turn) * d, 1.8)).toBe(false);
  });
});

describe("robbing the city", () => {
  it("goes: smash a case, grab the Big Rock between the lasers, run out of time (and lose it)", () => {
    let t = 500;
    const cash = profile.cash;
    tick(t, 0.016, you(J(-8.5, -6)));
    expect(game.prompt?.rob?.loot).toMatch(/^case-/);
    rob();
    expect(game.sites.jewelry.alarm).toBe(true);
    // Wait for the lasers to lift, then step inside.
    while (jewelryLasers(t).some((h) => h < 3.6)) t += 0.05;
    tick(t, 0.016, you(J(0, -10.8)));
    expect(life.dead).toBe(false);
    expect(game.prompt?.rob?.loot).toBe("rock");
    rob();
    t += DELIVER_TIME + 1;
    tick(t, 0.016, you(J(0, -10)));
    expect(game.wanted).toBeNull();
    expect(profile.cash).toBe(cash);
  });
});
