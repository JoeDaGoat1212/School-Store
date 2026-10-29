import { describe, expect, it } from "vitest";
import { BANK, CITY_PARKED, JEWELRY, LOOT, TOWERS, hitsCity, inBank, inJewelry, inVault, toWorld } from "./city-layout";
import { BANK_SITE, JEWELRY_SITE, inCity } from "./city-plan";
import { DELIVER_TIME, DROP_ZONE, game, heistBlocks, isClosed, isTaken, jewelryLasers, rob, setTeller, talk, tick, vaultLasers, vaultOpen } from "./heist";
import { life, revive } from "./life";
import { profile, transfer } from "./profile";
import { CURB, HOUSES, INTERSECTIONS, LOOPS, ROAD_HALF, ROADS, SIDEWALKS, WALKERS } from "./town-layout";

/* The city's layout (no towers on roads, the bank and shop can be walked into) and a robbery from start to finish. */

const B = (lx: number, lz: number) => toWorld(BANK, lx, lz);
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

  it("lets you walk in off the sidewalk, round the counter to the vault, and up to the jewelry cases", () => {
    expect(walkable(B(0, 14), B(0, -2), B(0, -11))).toBe(true);
    expect(walkable(B(0, -11), B(-17, -11), B(-17, -19), B(0, -19.5))).toBe(true);
    expect(walkable(J(0, 14), J(0, -3), J(-7.5, -6), J(-7.5, -18))).toBe(true);
    // …but not through the walls, or the shut vault door.
    expect(blocked(B(21.5, -10)) && blocked(B(10, -0.5)) && blocked(J(14.6, -10))).toBe(true);
    expect(blocked(B(0, -22.6))).toBe(true);
  });

  it("leaves room round the getaway cars", () => {
    for (const c of CITY_PARKED) for (const d of [1.75, -1.75]) expect(hitsCity(c.x - Math.sin(c.turn) * d, c.z - Math.cos(c.turn) * d, 1.8)).toBe(false);
  });
});

describe("robbing the city", () => {
  it("goes: rob the bank, crack the vault, dodge the lasers, grab the loot, stash it at the base, closed for 30 minutes", () => {
    let t = 1;
    tick(t, 0.016, you(B(0, -11)));
    expect(game.prompt?.talk).toBeTruthy();
    expect(game.prompt?.rob?.start).toBe("bank");

    // The teller: deposit some cash.
    talk();
    expect(game.teller).toBe(true);
    const cash = profile.cash;
    expect(transfer(100)).toBe(true);
    expect(profile.cash).toBe(cash - 100);
    expect(transfer(profile.cash + 1)).toBe(false);
    setTeller(false);

    rob();
    expect(game.sites.bank.alarm).toBe(true);
    expect(game.wanted).not.toBeNull();
    t += 6;
    tick(t, 0.016, you(B(0, -19.5)));
    expect(vaultOpen()).toBe(true);
    expect(heistBlocks(B(0, -22.6).x, B(0, -22.6).z, 0.9)).toBe(false);

    // Grab everything, jumping over the lasers (standing in a beam's path on the floor would kill you).
    const bankLoot = LOOT.filter((l) => l.site === "bank");
    for (const l of bankLoot) {
      tick(t, 0.016, you(l, 2));
      rob();
    }
    expect(life.dead).toBe(false);
    expect(bankLoot.every((l) => isTaken(l.id))).toBe(true);
    const haul = bankLoot.reduce((n, l) => n + l.value, 0);
    expect(game.wanted?.haul).toBe(haul);
    // Not yours until it's at the base.
    expect(profile.cash).toBe(cash - 100);

    // Walking out closes the bank.
    tick(t, 0.016, you(B(0, 14)));
    expect(isClosed("bank")).toBe(true);

    // Drive it to the secret base.
    tick(t + 60, 0.016, { x: DROP_ZONE.x, z: DROP_ZONE.z, y: 46, onFoot: false, driving: true });
    expect(game.wanted).toBeNull();
    expect(game.banner?.kind).toBe("escaped");
    expect(profile.cash).toBe(cash - 100 + haul);
    // The bank stays shut: nothing to grab.
    tick(t + 61, 0.016, you(B(0, -11)));
    expect(game.prompt?.rob).toBeUndefined();
  });

  it("kills you if you walk into a vault laser", () => {
    revive();
    // The vault's been open a while (it started opening at 0; it's now 10 seconds later).
    const beam = vaultLasers(10)[0];
    game.sites.bank = { alarm: true, alarmAt: 0, vaultAt: 0, closedUntil: 0 };
    game.taken.clear();
    tick(10, 0.016, you(B(0, beam.lz)));
    expect(life.dead).toBe(true);
    revive();
  });

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
