import { BANK_SITE } from "./city-plan";
import { hitsBox, type Box } from "./town-layout";
import { player } from "./you";

/*
 * City Bank, the big one: a grand stone bank on a raised podium, with the
 * vault in the level underneath. Plain numbers (no 3D code): bank.tsx
 * draws it, heist.ts runs the robbery, bump.ts stops you walking through it.
 *
 * Everything is in the bank's own frame: lx left–right (-38…38), lz out of
 * the front (0 at the front wall, -46 at the back), y up.
 *
 *   THE BANKING HALL (up the front steps, floor at y = PODIUM)
 *   ┌───────────────┬────────────────┬──────────────────────┐ lz -46
 *   │  manager's    │  security room │ stairs down ▼  fire  │
 *   │  office       │  (CCTV)        │ (ramp)        exit ▶ │
 *   ├────[door]─────┴────[door]──────┴──────[door]──────────┤ lz -30
 *   │              staff area (tellers, desks)              │
 *   ├─────────── teller counter ───────────────┬[STAFF DOOR]┤ lz -18 (keycard)
 *   │                banking hall                           │
 *   │        (columns, a security officer on patrol)        │
 *   └───────────────────────[doors]─────────────────────────┘ lz 0
 *                       the front steps
 *
 *   THE VAULT LEVEL (street level, y = 0, under the hall)
 *   ┌───────────────────────────────────────────────────────┐ lz -1
 *   │                     THE VAULT                         │
 *   │      (gold, cash, deposit boxes, floor lasers)        │
 *   ├────(round door)───────────────────────────────────────┤ lz -21
 *   │ antechamber  │ (plant room)   │ (under the ramp)│     │
 *   │  (camera)    ├────────────────┤ ramp ▲          │     │
 *   │              │ laser corridor ◀ landing         │     │
 *   └──────────────┴──────────────────────────────────┴─────┘ lz -46
 *
 * The heist (heist.ts): pickpocket the security officer's keycard (F, from
 * behind), badge through the staff door, dodge (or switch off) the cameras,
 * go down the ramp, time your way through the laser gates, drill the vault
 * door (it takes a while, and the alarm goes off), grab the loot (jumping
 * the vault's floor lasers) and get out (the fire exit at the back is
 * quieter than the front steps) and up to the secret base in time.
 */

export const BANK = { x: BANK_SITE.x, z: BANK_SITE.front, turn: 0 };
/** How high the banking hall's floor is (the vault level is underneath). */
export const PODIUM = 6.5;
const W = BANK_SITE.w / 2;
const D = BANK_SITE.d;
const T = 1;

export const BANK_PLAN = {
  halfW: W,
  depth: D,
  /** The hall's height (above the podium). */
  height: BANK_SITE.h,
  wall: T,
  doorHalf: 4,
  doorHeight: 8,
  /** The porch in front of the doors (on the podium), and the steps down from it to the street. */
  porch: 5,
  steps: { halfW: 16, depth: 13 },
  /** The columns along the front porch (on the podium). */
  columns: [-16, -11, -6, 6, 11, 16],
  columnZ: 2.6,
  /** Inside the hall. */
  hallColumns: [-22, -11, 11, 22].flatMap((lx) => [-5, -12].map((lz) => [lx, lz] as [number, number])),
  counter: { lx0: -26, lx1: 26, lz0: -20, lz1: -18, height: 1.45 },
  tellers: [-18, -6, 6, 18],
  tellerZ: -21.6,
  /** The staff door (keycard) at the right-hand end of the counter. */
  staffDoor: { lx: 32, lz: -19, half: 2 },
  backWall: { lz0: -29, lz1: -28 },
  officeDoor: { lx: -26, half: 2 },
  securityDoor: { lx: -6, half: 2 },
  stairDoor: { lx: 24, half: 2.6 },
  officeWallX: -14,
  securityWallX: 12.5,
  /** The CCTV desk in the security room (loop the cameras here). */
  cctv: { lx: -1, lz: -38 },
  /** The ramp down to the vault level: from the top (y = PODIUM) to the bottom (y = 0). */
  ramp: { lx0: 19, lx1: 29, top: -31, bottom: -39 },
  /** The landing at the bottom of the ramp. */
  landing: { lx0: 19, lx1: 29, lz0: -42, lz1: -39 },
  /** The fire exit (always opens from inside), and the steel stairs down the outside. */
  fireExit: { lz: -36, half: 1.6 },
  fireStairs: { lx0: W, lx1: W + 6, top: -36, bottom: -22 },
  // ---- The vault level ----
  vaultWall: { lz0: -21, lz1: -20 },
  vaultDoor: { lx: -26, radius: 2.8, y: 3.05 },
  corridor: { lx0: -14, lx1: 19, lz0: -42, lz1: -35 },
  ante: { lx0: -38, lx1: -14, lz0: -42, lz1: -21 },
  vault: { lx0: -38, lx1: 38, lz0: -20, lz1: -1 },
  /** Laser gates across the corridor (lx), each with its own on/off rhythm. */
  gates: [14, 7, 0, -7],
};
const P = BANK_PLAN;

export function toWorld(lx: number, lz: number) {
  return { x: BANK.x + lx, z: BANK.z + lz };
}
export function toLocal(x: number, z: number) {
  return { lx: x - BANK.x, lz: z - BANK.z };
}
type L = { lx0: number; lx1: number; lz0: number; lz1: number };
const box = (b: L): Box => ({ x: BANK.x + (b.lx0 + b.lx1) / 2, z: BANK.z + (b.lz0 + b.lz1) / 2, hw: (b.lx1 - b.lx0) / 2, hd: (b.lz1 - b.lz0) / 2, turn: 0 });
const L = (lx0: number, lx1: number, lz0: number, lz1: number): L => ({ lx0, lx1, lz0, lz1 });

// ---- Floors: which level you're on, and how high the floor is ---------------------------------

/** Inside the building's walls (the footprint, not the porch)? */
export const inFootprint = (x: number, z: number, pad = 0) => {
  const { lx, lz } = toLocal(x, z);
  return Math.abs(lx) < W + pad && lz < pad && lz > -D - pad;
};
const inRect = (lx: number, lz: number, r: L) => lx > r.lx0 && lx < r.lx1 && lz > r.lz0 && lz < r.lz1;

/** Which level you're on: 1 = the banking hall, 0 = the street / the vault level. */
export function bankLevel() {
  return player.level;
}

/**
 * How high the floor is at (x, z), for someone on `level`, and which level
 * they're on there (walking up the steps or the ramp changes it); or null
 * if it's just the street.
 */
export function bankFloor(x: number, z: number, level: number = player.level): { y: number; level: number } | null {
  const { lx, lz } = toLocal(x, z);
  const front = P.porch + P.steps.depth;
  if (Math.abs(lx) > W + 8 || lz > front + 1 || lz < -D - 1) return null;
  const slope = (y: number) => ({ y, level: y > PODIUM / 2 ? 1 : 0 });
  // The front steps.
  if (Math.abs(lx) < P.steps.halfW && lz >= P.porch && lz < front) return slope(PODIUM * (1 - (lz - P.porch) / P.steps.depth));
  // The fire stairs down the outside.
  const F = P.fireStairs;
  if (lx > F.lx0 - 0.5 && lx < F.lx1 && lz > F.top - 2 && lz < F.bottom) return slope(PODIUM * (1 - Math.min(1, Math.max(0, (lz - F.top) / (F.bottom - F.top)))));
  // The ramp inside.
  const R = P.ramp;
  if (lx > R.lx0 && lx < R.lx1 && lz < R.top && lz > R.bottom) return slope(PODIUM * ((lz - R.bottom) / (R.top - R.bottom)));
  // On the podium (the building and its porch).
  if (Math.abs(lx) < W && lz < P.porch && lz > -D) return { y: level === 1 ? PODIUM : 0, level };
  return null;
}

/** Every frame, where you are: keeps track of which level you're on. Returns your floor height (or null: the street). */
export function trackLevel(x: number, z: number) {
  const f = bankFloor(x, z);
  player.level = f ? f.level : 0;
  return f ? f.y : null;
}

// ---- Walls ------------------------------------------------------------------------------------

/** Desks in the staff area (clear of the doors). */
export const STAFF_DESKS = [-17, 2, 12, 32];

/** The banking hall's walls (y = PODIUM up). */
const HALL_WALLS: L[] = [
  // Outside
  L(-W, -P.doorHalf, -T, 0),
  L(P.doorHalf, W, -T, 0),
  L(-W, -W + T, -D, 0),
  L(W - T, W, -D, P.fireExit.lz - P.fireExit.half),
  L(W - T, W, P.fireExit.lz + P.fireExit.half, 0),
  L(-W, W, -D, -D + T),
  // The counter and the walls either side of it, with the staff door.
  L(P.counter.lx0, P.counter.lx1, P.counter.lz0, P.counter.lz1),
  L(-W, P.counter.lx0, P.counter.lz0, P.counter.lz1),
  L(P.counter.lx1, P.staffDoor.lx - P.staffDoor.half, P.counter.lz0, P.counter.lz1),
  L(P.staffDoor.lx + P.staffDoor.half, W, P.counter.lz0, P.counter.lz1),
  // The back rooms' front wall, with three doors.
  L(-W, P.officeDoor.lx - P.officeDoor.half, P.backWall.lz0, P.backWall.lz1),
  L(P.officeDoor.lx + P.officeDoor.half, P.securityDoor.lx - P.securityDoor.half, P.backWall.lz0, P.backWall.lz1),
  L(P.securityDoor.lx + P.securityDoor.half, P.stairDoor.lx - P.stairDoor.half, P.backWall.lz0, P.backWall.lz1),
  L(P.stairDoor.lx + P.stairDoor.half, W, P.backWall.lz0, P.backWall.lz1),
  // Between the back rooms.
  L(P.officeWallX - 0.5, P.officeWallX + 0.5, -D, P.backWall.lz0),
  L(P.securityWallX - 0.5, P.securityWallX + 0.5, -D, P.backWall.lz0),
  // Railings round the stairwell (so you go down the ramp, not over the edge).
  L(P.ramp.lx0 - 0.4, P.ramp.lx0, -D, P.ramp.top - 2.5),
  L(P.ramp.lx1, P.ramp.lx1 + 0.4, -D, P.ramp.top - 2.5),
  // Desks and the CCTV desk.
  L(P.cctv.lx - 3, P.cctv.lx + 3, P.cctv.lz - 0.8, P.cctv.lz + 0.8),
  L(-30, -22, -36, -34.4),
  ...STAFF_DESKS.map((lx) => L(lx - 1.6, lx + 1.6, -25.6, -24.4)),
];
/** The vault level's walls (y = 0 to PODIUM). */
const VAULT_WALLS: L[] = [
  // The podium all round (no way in from the street).
  L(-W, W, -T, 0),
  L(-W, -W + T, -D, 0),
  L(W - T, W, -D, 0),
  L(-W, W, -D, -D + T),
  // The vault wall, with the round door's opening.
  L(-W, P.vaultDoor.lx - P.vaultDoor.radius, P.vaultWall.lz0, P.vaultWall.lz1),
  L(P.vaultDoor.lx + P.vaultDoor.radius, W, P.vaultWall.lz0, P.vaultWall.lz1),
  // The plant room (solid), and the corridor's north wall.
  L(P.ante.lx1, P.ramp.lx0, P.vaultWall.lz0, P.corridor.lz1),
  // Under the ramp, and the rooms east of it (solid).
  L(P.ramp.lx0, P.ramp.lx1, P.vaultWall.lz0, P.ramp.top),
  // The ramp's side (you step off it at the bottom, onto the landing).
  L(P.ramp.lx0 - 0.4, P.ramp.lx0, P.ramp.bottom + 1.5, P.ramp.top),
  L(P.ramp.lx1, W, P.vaultWall.lz0, -D),
];

/** The staff door, the vault door: solid while shut (heist.ts says when they're open). */
export const STAFF_DOOR_BOX = box(L(P.staffDoor.lx - P.staffDoor.half, P.staffDoor.lx + P.staffDoor.half, P.counter.lz0, P.counter.lz1));
export const VAULT_DOOR_BOX = box(L(P.vaultDoor.lx - P.vaultDoor.radius, P.vaultDoor.lx + P.vaultDoor.radius, P.vaultWall.lz0, P.vaultWall.lz1));
const FIRE_DOOR_BOX = box(L(W - T, W, P.fireExit.lz - P.fireExit.half, P.fireExit.lz + P.fireExit.half));
const HALL_BOXES = HALL_WALLS.map(box);
const VAULT_BOXES = VAULT_WALLS.map(box);
/** The columns: the porch's (on the podium) and the hall's. */
const COLUMNS = [...P.columns.map((lx) => ({ ...toWorld(lx, P.columnZ), r: 0.9 })), ...P.hallColumns.map(([lx, lz]) => ({ ...toWorld(lx, lz), r: 1 }))];

/** Hooks from heist.ts: is the staff door open, the vault door open, is the fire door open. */
export const bankDoors = { staff: () => false, vault: () => false, fire: () => false, loot: (_id: string) => null as Box | null };

/** Does a circle at (x, z) hit any of the bank's walls, on your level? */
export function bankBlocks(x: number, z: number, r: number) {
  const { lx, lz } = toLocal(x, z);
  if (Math.abs(lx) > W + 8 + r || lz > P.porch + P.steps.depth + r || lz < -D - r) return false;
  const F = P.fireStairs;
  // The fire stairs' outer rail.
  if (lx > F.lx1 - 0.3 - r && lx < F.lx1 + r && lz > F.top - 2 && lz < F.bottom) return true;
  if (player.level === 0) {
    // From the street the podium's a solid block (up the steps or the fire stairs to get on it).
    if (Math.abs(lx) < W + r && lz < P.porch + r && lz > 0 - r && lz > -D - r && !(Math.abs(lx) < W - T && lz < 0)) return true;
    for (const b of VAULT_BOXES) if (hitsBox(x, z, r, b)) return true;
    if (!bankDoors.vault() && hitsBox(x, z, r, VAULT_DOOR_BOX)) return true;
    for (const id of LOOT_IDS) {
      const b = bankDoors.loot(id);
      if (b && hitsBox(x, z, r, b)) return true;
    }
    return false;
  }
  for (const b of HALL_BOXES) if (hitsBox(x, z, r, b)) return true;
  if (!bankDoors.staff() && hitsBox(x, z, r, STAFF_DOOR_BOX)) return true;
  if (!bankDoors.fire() && hitsBox(x, z, r, FIRE_DOOR_BOX)) return true;
  for (const c of COLUMNS) if (Math.hypot(x - c.x, z - c.z) < r + c.r) return true;
  // Up on the porch: don't walk off the edge (only down the steps).
  if (lz > -T) {
    if (Math.abs(lx) > W - r) return true;
    if (lz > P.porch - r && Math.abs(lx) > P.steps.halfW - r && lz < P.porch + 1) return true;
    if (lz > P.porch && Math.abs(lx) > P.steps.halfW - r) return true;
  }
  // On the fire stairs: stay on them.
  if (lx > W && (lz < F.top - 2 + r || lz > F.bottom)) return true;
  return false;
}
/** Walls only (for the camera). */
export function bankViewBlocked(x: number, z: number) {
  if (!inFootprint(x, z, 1)) return false;
  for (const b of player.level === 0 ? VAULT_BOXES : HALL_BOXES.slice(0, 6)) if (hitsBox(x, z, 0.2, b)) return true;
  return false;
}

// ---- Where you are --------------------------------------------------------------------------------

/** In the bank (either level)? */
export const inBank = (x: number, z: number) => inFootprint(x, z, -T);
export const inHall = (x: number, z: number) => player.level === 1 && inRect(toLocal(x, z).lx, toLocal(x, z).lz, L(-W, W, P.counter.lz1, 0));
export const inStaffArea = (x: number, z: number) => player.level === 1 && inFootprint(x, z) && toLocal(x, z).lz < P.counter.lz0 && toLocal(x, z).lz > P.backWall.lz1;
export const inVault = (x: number, z: number) => player.level === 0 && inFootprint(x, z) && inRect(toLocal(x, z).lx, toLocal(x, z).lz, P.vault);
export const inCorridor = (x: number, z: number) => player.level === 0 && inRect(toLocal(x, z).lx, toLocal(x, z).lz, P.corridor);
export const inAnte = (x: number, z: number) => player.level === 0 && inRect(toLocal(x, z).lx, toLocal(x, z).lz, P.ante);
export const inSecurityRoom = (x: number, z: number) => player.level === 1 && inRect(toLocal(x, z).lx, toLocal(x, z).lz, L(P.officeWallX, P.securityWallX, -D, P.backWall.lz0));

// ---- The security cameras -------------------------------------------------------------------------

/** Each camera: where it is (bank frame), its level, which way it faces (yaw 0 = +lz), and how far it sweeps. */
export const CAMERAS = [
  { id: "staff", lx: W - 1.5, lz: -29, level: 1, y: PODIUM + 6, yaw: -Math.PI * 0.62, sweep: 0.75, range: 26 },
  { id: "back", lx: -W + 1.5, lz: -21, level: 1, y: PODIUM + 6, yaw: Math.PI * 0.62, sweep: 0.7, range: 26 },
  { id: "ante", lx: -W + 1.5, lz: -45, level: 0, y: 5.4, yaw: Math.PI * 0.75, sweep: 0.55, range: 22 },
  { id: "corridor", lx: P.corridor.lx0 + 1, lz: -45, level: 0, y: 5.4, yaw: Math.PI * 0.5 + 0.3, sweep: 0.35, range: 30 },
];
/** Where each camera's looking right now. */
export const cameraYaw = (c: (typeof CAMERAS)[number], now: number) => c.yaw + Math.sin(now * 0.55 + c.lx) * c.sweep;
/** Can this camera see (x, z)? (Within its range and its 50° view, on its level.) */
export function cameraSees(c: (typeof CAMERAS)[number], now: number, x: number, z: number) {
  if (player.level !== c.level) return false;
  // Each camera only watches its own room (not through the walls).
  if (c.level === 1 ? !inStaffArea(x, z) : c.id === "ante" ? !inAnte(x, z) : !inCorridor(x, z)) return false;
  const { lx, lz } = toLocal(x, z);
  const dx = lx - c.lx;
  const dz = lz - c.lz;
  const d = Math.hypot(dx, dz);
  if (d > c.range || d < 0.5) return false;
  const a = Math.atan2(dx, dz);
  const off = Math.atan2(Math.sin(a - cameraYaw(c, now)), Math.cos(a - cameraYaw(c, now)));
  return Math.abs(off) < 0.44;
}

// ---- The laser gates in the corridor, and the vault's floor lasers ------------------------------

/** Is laser gate i on right now? Each blinks on and off on its own rhythm. */
export function gateOn(i: number, now: number) {
  const period = 3.4 + i * 0.35;
  const t = (now + i * 1.3) % period;
  return t < period * 0.58;
}
/** The low beam sweeping up and down the corridor (jump it): where it is (lx), and its height. */
export function sweepBeam(now: number) {
  const C = P.corridor;
  const mid = (C.lx0 + C.lx1) / 2;
  return { lx: mid + Math.sin(now * 0.9) * ((C.lx1 - C.lx0) / 2 - 1), y: 0.7 };
}
/** The vault's two floor lasers, sweeping front to back (jump them). */
export function vaultBeams(now: number) {
  const V = P.vault;
  const mid = (V.lz0 + V.lz1) / 2;
  const half = (V.lz1 - V.lz0) / 2 - 1;
  return [
    { lz: mid + Math.sin(now * 1.1) * half, y: 0.75 },
    { lz: mid + Math.sin(now * 1.1 + Math.PI) * half, y: 0.75 },
  ];
}

// ---- The loot -----------------------------------------------------------------------------------

export type BankLoot = { id: string; kind: "gold" | "cash" | "boxes"; lx: number; lz: number; value: number; label: string };
export const BANK_LOOT: BankLoot[] = [
  ...[-30, -18].map((lx, i): BankLoot => ({ id: `gold-${i}`, kind: "gold", lx, lz: -4.5, value: 150000, label: "gold bars" })),
  ...[18, 30].map((lx, i): BankLoot => ({ id: `gold-${i + 2}`, kind: "gold", lx, lz: -4.5, value: 150000, label: "gold bars" })),
  ...[-6, 0, 6].flatMap((lx, i) => [-9, -15].map((lz, j): BankLoot => ({ id: `cash-${i * 2 + j}`, kind: "cash", lx, lz, value: 60000, label: "a pallet of cash" }))),
  ...[-30, 30].map((lx, i): BankLoot => ({ id: `boxes-${i}`, kind: "boxes", lx, lz: -14, value: 45000, label: "safe-deposit boxes" })),
];
const LOOT_IDS = BANK_LOOT.map((l) => l.id);
/** Each pile's footprint (while it's there). */
export const BANK_LOOT_BOXES: Record<string, Box> = Object.fromEntries(BANK_LOOT.map((l) => [l.id, box(L(l.lx - 1.7, l.lx + 1.7, l.lz - 1.3, l.lz + 1.3))]));

/** Spots inside, in world units (the security officer's patrol, where the police wait outside). */
export const GUARD_ROUTE = [
  [-24, -4],
  [24, -4],
  [24, -15],
  [-24, -15],
].map(([lx, lz]) => toWorld(lx, lz));
/** Where officers wait for you to come out: the foot of the front steps, and the foot of the fire stairs. */
export const EXITS = [toWorld(0, P.porch + P.steps.depth + 3), toWorld(W + 3, P.fireStairs.bottom + 4)];
