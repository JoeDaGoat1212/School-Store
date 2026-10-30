import { beforeEach, describe, expect, it } from "vitest";
import { CELL_COUNT, EXIT, GUARD_ROUTES, JAIL_BOX, JAIL_DOORS, JAIL_ROOMS, JAIL_SPAWN, MY_CELL, doorOpen, inJailBuilding, inMyCell, inYard, jailBlocks } from "./jail-layout";
import { jail, lockUp, tickJail } from "./jail-state";
import { life } from "./life";
import { player } from "./you";

/* The jail: 100 cells, no way out without a keycard, and once you're locked up you stay locked up until you break out. */

const BODY = 0.6;

/** Every spot you can walk to from your cell (on a 1-unit grid), with these doors open. */
function reachable(open: (id: string) => boolean) {
  for (const d of JAIL_DOORS) if (d.kind !== "open") doorOpen[d.id] = open(d.id) ? 1 : 0;
  const seen = new Set<string>();
  const queue: [number, number][] = [[Math.round(JAIL_SPAWN.x), Math.round(JAIL_SPAWN.z)]];
  let leftTheBuilding = false;
  while (queue.length) {
    const [x, z] = queue.pop()!;
    const k = `${x},${z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (!inJailBuilding(x, z) && !inYard(x, z)) {
      leftTheBuilding = true;
      continue;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      if (!jailBlocks(x + dx, z + dz, BODY)) queue.push([x + dx, z + dz]);
  }
  return { seen, leftTheBuilding };
}
const at = (seen: Set<string>, x: number, z: number) => seen.has(`${Math.round(x)},${Math.round(z)}`);

describe("the jail's layout", () => {
  it("is big: 100 cells, and you start in yours", () => {
    expect(CELL_COUNT).toBe(100);
    expect(inMyCell(JAIL_SPAWN.x, JAIL_SPAWN.z)).toBe(true);
    expect(jailBlocks(JAIL_SPAWN.x, JAIL_SPAWN.z, BODY)).toBe(false);
  });

  it("keeps you in your cell until the door opens", () => {
    const { seen, leftTheBuilding } = reachable(() => false);
    expect(leftTheBuilding).toBe(false);
    expect(seen.size).toBeLessThan(200);
  });

  it("lets you roam the cell blocks, mess hall, gym, library and laundry, but not leave, without a keycard", () => {
    const { seen, leftTheBuilding } = reachable((id) => id === `cell-${MY_CELL}`);
    expect(leftTheBuilding).toBe(false);
    const mid = (r: { x0: number; x1: number; z0: number; z1: number }) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2] as const;
    expect(at(seen, ...mid(JAIL_ROOMS.gym))).toBe(true);
    expect(at(seen, ...mid(JAIL_ROOMS.library))).toBe(true);
    expect(at(seen, ...mid(JAIL_ROOMS.laundry))).toBe(true);
    expect(at(seen, ...mid(JAIL_ROOMS.guards))).toBe(false);
    expect(at(seen, ...mid(JAIL_ROOMS.lobby))).toBe(false);
  });

  it("has a way out through the lobby with a keycard", () => {
    const { leftTheBuilding } = reachable((id) => id === `cell-${MY_CELL}` || JAIL_DOORS.find((d) => d.id === id)?.kind === "security");
    expect(leftTheBuilding).toBe(true);
  });

  it("has guards that walk on open floor", () => {
    for (const d of JAIL_DOORS) if (d.kind !== "open") doorOpen[d.id] = 0;
    for (const route of GUARD_ROUTES)
      for (const p of route) {
        expect(jailBlocks(p.x, p.z, BODY)).toBe(false);
        expect(inJailBuilding(p.x, p.z) || inYard(p.x, p.z)).toBe(true);
      }
  });
});

describe("doing time", () => {
  beforeEach(() => {
    life.inJail = false;
    Object.assign(player, { x: JAIL_SPAWN.x, z: JAIL_SPAWN.z, hop: false, snap: false });
    lockUp(0);
  });

  it("puts you straight back in your cell if you end up outside without breaking out", () => {
    // However you got there (a quick trip, getting back in a car…).
    Object.assign(player, { x: 0, z: 11, hop: false });
    for (let t = 0; t < 1; t += 0.1) tickJail(t, 0.1);
    expect(life.inJail).toBe(true);
    expect(player.x).toBe(JAIL_SPAWN.x);
    expect(player.z).toBe(JAIL_SPAWN.z);
  });

  it("sets you free when you walk out of the lobby's front door", () => {
    Object.assign(player, { x: EXIT.x, z: JAIL_BOX.z1 - 5 });
    tickJail(1, 0.1);
    expect(life.inJail).toBe(true);
    Object.assign(player, { x: EXIT.x, z: JAIL_BOX.z1 + 3 });
    tickJail(1.1, 0.1);
    expect(life.inJail).toBe(false);
    expect(jail.reachedLobby).toBe(false);
  });
});
