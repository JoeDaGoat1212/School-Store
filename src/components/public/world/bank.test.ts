import { describe, expect, it } from "vitest";
import { BANK_PLAN as P, PODIUM, bankBlocks, gateOn, toWorld, trackLevel } from "./bank-layout";
import { DRILL_TIME, bank } from "./bank-heist";
import { hitsCity } from "./city-layout";
import { DROP_ZONE, game, heistBlocks, isClosed, isTaken, rob, tick, vaultOpen } from "./heist";
import { interaction, press, tickInteract } from "./interact";
import { life, revive } from "./life";
import { pockets, profile } from "./profile";
import { player } from "./you";

/* City Bank: getting in, up the steps, through the staff door with a stolen keycard, down to the vault, and out with the loot. */

const B = (lx: number, lz: number) => toWorld(lx, lz);
/** Stand somewhere (as the camera would put you there: working out which floor you're on). */
function stand(p: { x: number; z: number }) {
  player.x = p.x;
  player.z = p.z;
  const y = trackLevel(p.x, p.z) ?? 0;
  player.y = y;
  return y;
}
const blocked = (p: { x: number; z: number }) => hitsCity(p.x, p.z, 0.9) || heistBlocks(p.x, p.z, 0.9) || bankBlocks(p.x, p.z, 0.9);
/** Walk in a straight line through these points (keeping track of the floor). False if something's in the way. */
function walk(...pts: { x: number; z: number }[]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n };
      stand(p);
      if (blocked(p)) {
        if (process.env.DEBUG_WALK) console.log("blocked at", (p.x - B(0, 0).x).toFixed(2), (p.z - B(0, 0).z).toFixed(2), "level", player.level);
        return false;
      }
    }
  }
  return true;
}
const you = (p: { x: number; z: number }, y?: number) => ({ x: p.x, z: p.z, y: y ?? player.y, onFoot: true, driving: false });
const actions = (p: { x: number; z: number }) => {
  tickInteract({ x: p.x, z: p.z, y: player.y, yaw: 0, onFoot: true, driving: false }, false);
  return interaction.actions;
};

describe("City Bank", () => {
  it("is up its front steps: the hall's floor is on the podium, the vault level underneath", () => {
    player.level = 0;
    expect(walk(B(0, 22), B(0, P.porch + 1), B(0, -2), B(0, -10))).toBe(true);
    expect(player.level).toBe(1);
    expect(player.y).toBe(PODIUM);
    // Off the porch's edge: no.
    stand(B(0, 2));
    expect(blocked(B(P.steps.halfW + 3, 4.8))).toBe(true);
    // From the street, the podium's solid.
    stand(B(-30, 10));
    expect(player.level).toBe(0);
    expect(blocked(B(-30, 4))).toBe(true);
  });

  it("keeps the staff door shut without a keycard", () => {
    pockets.bankCard = false;
    walk(B(0, 22), B(0, -2), B(P.staffDoor.lx, -15));
    for (let t = 0; t < 2; t += 0.1) tick(100 + t, 0.1, you(B(P.staffDoor.lx, -16.5)));
    expect(blocked(B(P.staffDoor.lx, P.staffDoor.lz))).toBe(true);
  });

  it("goes: pickpocket the keycard, the staff door, loop the cameras, the ramp, the lasers, drill the vault, the loot, out the fire exit, to the base", () => {
    revive();
    let t = 200;
    const step = (p: { x: number; z: number }, secs = 0.1, y?: number) => {
      stand(p);
      tick((t += secs), secs, you(p, y));
    };
    // Into the hall, and sneak up behind the officer while he's walking away.
    walk(B(0, 22), B(0, -2));
    step(B(0, -2));
    const g = bank.guard;
    g.lookUntil = 0;
    g.nextLook = t + 100;
    const behind = { x: g.x - Math.sin(g.yaw) * 1.6, z: g.z - Math.cos(g.yaw) * 1.6 };
    stand(behind);
    const pick = actions(behind).find((a) => a.key === "F");
    expect(pick).toBeDefined();
    press("F");
    expect(pockets.bankCard).toBe(true);
    expect(game.sites.bank.alarm).toBe(false);

    // The staff door opens for the keycard.
    const door = B(P.staffDoor.lx, -16.6);
    for (let k = 0; k < 10; k++) step(door);
    expect(blocked(B(P.staffDoor.lx, P.staffDoor.lz))).toBe(false);
    expect(walk(door, B(P.staffDoor.lx, -22.5))).toBe(true);

    // Loop the cameras in the security room (staying out of their view on the way… we're quick).
    const desk = B(P.cctv.lx, P.cctv.lz + 2.2);
    bank.loopedUntil = 0;
    expect(walk(B(P.staffDoor.lx, -22.5), B(P.securityDoor.lx, -22.5), B(P.securityDoor.lx, -32), desk)).toBe(true);
    bank.seen = 0;
    expect(actions(desk).some((a) => a.text.startsWith("Loop"))).toBe(true);
    press("E");
    for (let k = 0; k < 70; k++) step(desk);
    expect(bank.loopedUntil).toBeGreaterThan(game.wallClock);
    expect(game.sites.bank.alarm).toBe(false);

    // Down the ramp to the vault level.
    const top = B((P.ramp.lx0 + P.ramp.lx1) / 2, P.ramp.top + 1.5);
    const landing = B((P.ramp.lx0 + P.ramp.lx1) / 2, -39.6);
    expect(walk(desk, B(P.securityDoor.lx, -32), B(P.securityDoor.lx, -22.5), B(P.stairDoor.lx, -22.5), top, landing)).toBe(true);
    expect(player.level).toBe(0);
    expect(player.y).toBe(0);

    // Through the laser corridor, going through each gate while it's off.
    const z = (P.corridor.lz0 + P.corridor.lz1) / 2;
    let x = landing.x;
    stand(landing);
    expect(walk(landing, B(P.ramp.lx0 - 1, z))).toBe(true);
    x = B(P.ramp.lx0 - 1, z).x;
    const end = B(P.ante.lx1 - 3, z).x;
    while (x > end) {
      const lx = x - P.halfW * 0 - B(0, 0).x;
      const next = lx - 0.25;
      const gate = P.gates.findIndex((gx) => Math.abs(next - gx) < 0.5);
      if (gate >= 0 && gateOn(gate, t)) {
        t += 0.1;
        continue;
      }
      x -= 0.25;
      step({ x, z: B(0, z).z }, 0.03, 2);
      expect(life.dead).toBe(false);
    }

    // Drill the vault door: the alarm goes off; stay with it.
    const at = B(P.vaultDoor.lx, P.vaultWall.lz0 - 2);
    expect(walk({ x, z: B(0, z).z }, at)).toBe(true);
    expect(blocked(B(P.vaultDoor.lx, (P.vaultWall.lz0 + P.vaultWall.lz1) / 2))).toBe(true);
    expect(actions(at).some((a) => a.key === "R" && a.text.startsWith("Drill"))).toBe(true);
    press("R");
    expect(game.sites.bank.alarm).toBe(true);
    expect(game.wanted).not.toBeNull();
    for (let s = 0; s < DRILL_TIME + 6; s += 0.25) step(at, 0.25);
    expect(vaultOpen()).toBe(true);
    expect(blocked(B(P.vaultDoor.lx, (P.vaultWall.lz0 + P.vaultWall.lz1) / 2))).toBe(false);

    // Grab everything (jumping, over the floor lasers).
    const loot = [...game.taken.keys()];
    expect(loot.length).toBe(0);
    const cash = profile.cash;
    let haul = 0;
    for (const id of ["gold-0", "gold-1", "gold-2", "gold-3", "cash-0", "cash-3", "boxes-0", "boxes-1"]) {
      const l = (await_loot(id));
      step(l, 0.016, 2);
      expect(game.prompt?.rob?.loot).toBe(id);
      rob();
      expect(isTaken(id)).toBe(true);
      haul += 1;
    }
    expect(life.dead).toBe(false);
    expect(haul).toBe(8);
    expect(game.wanted!.haul).toBeGreaterThan(800000);

    // Out the fire exit and down the stairs: the bank's closed behind you.
    player.level = 0;
    stand(at);
    expect(walk(at, B(P.vaultDoor.lx + 6, (P.corridor.lz0 + P.corridor.lz1) / 2))).toBe(true);
    // (Back through the corridor and up the ramp, the gates off for the test.)
    stand(B(P.ramp.lx0 - 1, z));
    expect(walk(B(P.ramp.lx0 - 1, z), landing, top, B(24, -31.2), B(34, -31.2), B(34, P.fireExit.lz), B(P.halfW - 2.2, P.fireExit.lz))).toBe(true);
    expect(player.level).toBe(1);
    for (let k = 0; k < 10; k++) step(B(P.halfW - 2.2, P.fireExit.lz));
    expect(walk(B(P.halfW - 2.2, P.fireExit.lz), B(P.halfW + 3, P.fireExit.lz), B(P.halfW + 3, P.fireStairs.bottom - 0.5), B(P.halfW + 3, P.fireStairs.bottom + 6))).toBe(true);
    expect(player.level).toBe(0);
    step(B(P.halfW + 3, P.fireStairs.bottom + 6));
    expect(isClosed("bank")).toBe(true);

    // To the base.
    const w = game.wanted!.haul;
    tick(t + 30, 0.016, { x: DROP_ZONE.x, z: DROP_ZONE.z, y: 46, onFoot: false, driving: true });
    expect(game.wanted).toBeNull();
    expect(profile.cash).toBe(cash + w);
  });

  it("kills you in the laser corridor if you walk through a gate while it's on", () => {
    revive();
    game.sites.bank.closedUntil = 0;
    player.level = 0;
    const z = (P.corridor.lz0 + P.corridor.lz1) / 2;
    let t = 900;
    while (!gateOn(0, t)) t += 0.05;
    const p = B(P.gates[0], z);
    stand({ x: p.x, z: p.z });
    player.level = 0;
    tick(t, 0.016, you(p, 2));
    expect(life.dead).toBe(true);
    revive();
  });
});

function await_loot(id: string) {
  const l = [
    ["gold-0", -30, -4.5],
    ["gold-1", -18, -4.5],
    ["gold-2", 18, -4.5],
    ["gold-3", 30, -4.5],
    ["cash-0", -6, -9],
    ["cash-3", 0, -15],
    ["boxes-0", -30, -14],
    ["boxes-1", 30, -14],
  ].find((x) => x[0] === id)!;
  // Stand just in front of the pile (on the antechamber side of it).
  return B((l[1] as number) + 0, (l[2] as number) - 2);
}
