import { describe, expect, it } from "vitest";
import { hitsCity } from "./city-layout";
import { heistBlocks } from "./heist";
import { hitsBox, townObstaclesNear } from "./town-layout";
import { player } from "./you";
import { HOMES, access, homePlan, homePoint } from "./houses-layout";
import { GAME_HOUR, STRIKES, clockIn, clockOut, finishMaking, handOver, jobs, shopAt, takeOrder, tickJobs, untaken } from "./jobs";
import { MENUS, emptyBuild, priceOf, randomOrder, rng, score } from "./menus";
import { profile } from "./profile";
import { buyHome } from "./realty";
import { ROOMS, inRoom, roomPoint, roomsBlock, shopPlan } from "./rooms";
import { MODELS } from "./vehicles";
import { SHOPS, type ShopKey } from "./world-map";

/* Restaurant Row's jobs, the shops' walls, the homes for sale and the dealership's prices. */

const KEYS = Object.keys(SHOPS) as ShopKey[];
/** Would someone on foot bump into something here? (Like bump.ts's walkBlocked, without the cars.) */
function walkBlocked(x: number, z: number) {
  const r = 0.9;
  if (roomsBlock(x, z, r) || hitsCity(x, z, r) || heistBlocks(x, z, r)) return true;
  const near = townObstaclesNear(x, z);
  return near.boxes.some((b) => hitsBox(x, z, r, b)) || near.circles.some((c) => Math.hypot(x - c.x, z - c.z) < r + c.r);
}

describe("the menus", () => {
  it("score a perfect copy of the order as perfect, and an empty one as poor", () => {
    for (const k of KEYS) {
      const r = rng(7 + k.length);
      for (let i = 0; i < 20; i++) {
        const order = randomOrder(k, r);
        expect(score(k, order, order, 1)).toBeCloseTo(1, 5);
        expect(score(k, order, emptyBuild(k), 0)).toBeLessThan(0.75);
        expect(priceOf(k, order)).toBeGreaterThanOrEqual(MENUS[k].base);
      }
    }
  });
});

describe("the shops", () => {
  it("can be walked into, through the door to the counter", () => {
    for (const k of KEYS) {
      const P = shopPlan(k);
      const paths = [
        [roomPoint(k, 0, 3), roomPoint(k, 0, -2), roomPoint(k, P.ordering.lx, P.ordering.lz)],
        [roomPoint(k, 0, -2), roomPoint(k, 0, P.waiting.lz)],
      ];
      for (const pts of paths)
      for (let i = 0; i < pts.length - 1; i++)
        for (let s = 0; s <= 20; s++) {
          const x = pts[i].x + ((pts[i + 1].x - pts[i].x) * s) / 20;
          const z = pts[i].z + ((pts[i + 1].z - pts[i].z) * s) / 20;
          expect(walkBlocked(x, z), `${k} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(false);
        }
      // Staff get behind the counter through the gap at its right end.
      const gap = roomPoint(k, P.counter.lx1 + 2.5, -10.4);
      expect(walkBlocked(gap.x, gap.z)).toBe(false);
      expect(shopAt(roomPoint(k, 0, -5).x, roomPoint(k, 0, -5).z)).toBe(k);
    }
  });
  it("don't overlap each other", () => {
    for (const a of ROOMS)
      for (const b of ROOMS) if (a !== b) expect(inRoom(b, a.site.x, a.site.z - Math.cos(a.site.turn) * 3)).toBe(false);
  });
});

describe("a shift", () => {
  it("serves a customer from the kiosk to the counter, and pays", () => {
    jobs.hireAll = true;
    const P = shopPlan("pizza");
    const stand = roomPoint("pizza", P.staff.lx, P.staff.lz);
    Object.assign(player, { x: stand.x, z: stand.z });
    let t = 1000;
    tickJobs(t, 0.016);
    clockIn("pizza");
    Object.assign(player, { x: stand.x, z: stand.z });
    // Wait for someone to order at the kiosk.
    for (let i = 0; i < 4000 && untaken("pizza").length === 0; i++) tickJobs((t += 0.1), 0.1);
    const c = untaken("pizza")[0];
    expect(c).toBeDefined();
    takeOrder("pizza", c.id);
    const ticket = jobs.shift!.tickets.find((x) => x.customer === c.id)!;
    finishMaking(ticket, ticket.order, 1);
    const cash = profile.cash;
    handOver();
    expect(profile.cash).toBeGreaterThan(cash);
    expect(jobs.shift!.served).toBe(1);
    const bank = profile.bank;
    tickJobs((t += GAME_HOUR), 0.016);
    clockOut();
    expect(profile.bank).toBeGreaterThan(bank + 15);
  });
  it("fires you after too many walkouts", () => {
    jobs.hireAll = true;
    const P = shopPlan("burger");
    const stand = roomPoint("burger", P.staff.lx, P.staff.lz);
    Object.assign(player, { x: stand.x, z: stand.z });
    let t = 5000;
    clockIn("burger");
    for (let i = 0; i < 40000 && jobs.shift; i++) tickJobs((t += 0.1), 0.1);
    expect(jobs.shift).toBeNull();
    expect(profile.jobs.burger?.walkouts).toBeGreaterThanOrEqual(STRIKES);
  });
});

describe("homes", () => {
  it("get bigger as they get pricier, from $150,000 to $20 million", () => {
    const sorted = [...HOMES].sort((a, b) => a.price - b.price);
    expect(sorted[0].price).toBe(150000);
    expect(sorted[sorted.length - 1].price).toBe(20000000);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].sqft).toBeGreaterThan(sorted[i - 1].sqft);
    expect(HOMES.filter((h) => h.price >= 1e6).every((h) => h.area === "estates")).toBe(true);
  });
  it("are locked until you buy one, then you can walk in", () => {
    const h = HOMES[0];
    const P = homePlan(h);
    const door = homePoint(h, 0, -0.2);
    expect(walkBlocked(door.x, door.z)).toBe(true);
    profile.cash = 200000;
    expect(buyHome(h.id)).toBeNull();
    expect(walkBlocked(door.x, door.z)).toBe(false);
    const living = homePoint(h, P.living.lx + 2, P.living.lz);
    expect(walkBlocked(living.x, living.z)).toBe(false);
  });
  it("in Crescent Heights are behind a gate", () => {
    access.gateOpenUntil = 0;
    access.now = 10;
    expect(walkBlocked(6, 572)).toBe(true);
    access.gateOpenUntil = 20;
    expect(walkBlocked(6, 572)).toBe(false);
  });
});

describe("Apex Motors", () => {
  it("sells sedans, SUVs and motorcycles, and the pricier the faster", () => {
    for (const c of ["Sedans", "SUVs", "Motorcycles"]) expect(MODELS.some((m) => m.category === c)).toBe(true);
    const cheapest = [...MODELS].sort((a, b) => a.price - b.price);
    expect(cheapest[cheapest.length - 1].top).toBe(Math.max(...MODELS.map((m) => m.top)));
  });
});
