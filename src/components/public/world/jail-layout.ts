import { hitsBox, type Box } from "./town-layout";

/*
 * The jail, east of the city at the end of the main road. Plain numbers (no
 * 3D code); jail.tsx draws it. It's a big one: 100 cells in four cell blocks.
 *
 *      N (-z)
 *   ┌──────────────────── YARD (outside, fenced, watchtowers) ──────────────────┐
 *   └──────────────────────────────────────────────┬─ door to the yard (keycard)┘
 *   ┌──────────────────────────────────────────────┼────────────────────────────┐
 *   │ BLOCK A: cells 1–25 (barred doors)           │                            │
 *   │ ───── corridor ───────────────────────────── │                            │
 *   │ BLOCK B: cells 26–50     ← you start in here │        MESS HALL           │
 *   │ ───── corridor ───────────────────────────── │   (tables, the kitchen     │
 *   │ BLOCK C: cells 51–75                         │    counter)                │
 *   │ ───── corridor ───────────────────────────── │                            │
 *   │ BLOCK D: cells 76–100                        │                            │
 *   │ ───── corridor ───────────────────────────── │                            │
 *   ├────────────────────────────────────── (open doorway) ─────────────────────┤
 *   │ ═══════════════════════ MAIN HALL ═════════════════════════════════════════ │
 *   ├────────┬──────────┬───────────┬─────────────────────┬────────────────────┤
 *   │  GYM   │ LIBRARY  │  LAUNDRY  │ GUARD ROOM (keycard)│ LOBBY (keycard)    │
 *   └────────┴──────────┴───────────┴─────────────────────┴──── exit (keycard) ┘
 *      S (+z): the main road
 *
 * You start in a cell in block B. Its door slides open after 30 seconds.
 * The cell corridors open into the mess hall, the mess hall into the main
 * hall, and the main hall into the gym, library and laundry. The guard
 * room, the lobby, the yard and the front exit are behind security doors
 * that only open for a keycard, and the guards have the keycards: sneak up
 * behind one and pickpocket it (F). Get out through the lobby's front door
 * and you're free.
 */

export const JAIL_BOX = { x0: 1080, x1: 1530, z0: -190, z1: 30, h: 10, wall: 1 };

/** The cell blocks: four rows of 25 cells, each row facing south onto its own corridor. */
export const CELL = { w: 10, d: 14, corridor: 10 };
export const CELL_BLOCKS = 4;
export const CELLS_PER_ROW = 25;
export const CELL_X0 = JAIL_BOX.x0 + 1;
export const CELL_X1 = CELL_X0 + CELL.w * CELLS_PER_ROW;
/** Row r's cells run from z0 to z1 (their barred fronts are at z1), then its corridor to z1 + CELL.corridor. */
export const CELL_ROWS = Array.from({ length: CELL_BLOCKS }, (_, r) => {
  const z0 = JAIL_BOX.z0 + 1 + r * (CELL.d + CELL.corridor);
  return { r, letter: "ABCD"[r], z0, z1: z0 + CELL.d, corridor: { z0: z0 + CELL.d, z1: z0 + CELL.d + CELL.corridor } };
});
export const CELL_COUNT = CELL_BLOCKS * CELLS_PER_ROW;
/** The wall between the cell blocks / mess hall and the main hall, and the one between the main hall and the rooms. */
export const HALL = { z0: CELL_ROWS[CELL_BLOCKS - 1].corridor.z1, z1: CELL_ROWS[CELL_BLOCKS - 1].corridor.z1 + 12 };
/** The big rooms. */
export const MESS_HALL = { x0: CELL_X1, x1: JAIL_BOX.x1 - 1, z0: JAIL_BOX.z0 + 1, z1: HALL.z0 };
export const JAIL_ROOMS = {
  gym: { x0: JAIL_BOX.x0 + 1, x1: 1200, z0: HALL.z1, z1: JAIL_BOX.z1 - 1 },
  library: { x0: 1200, x1: 1280, z0: HALL.z1, z1: JAIL_BOX.z1 - 1 },
  laundry: { x0: 1280, x1: 1360, z0: HALL.z1, z1: JAIL_BOX.z1 - 1 },
  guards: { x0: 1360, x1: 1440, z0: HALL.z1, z1: JAIL_BOX.z1 - 1 },
  lobby: { x0: 1440, x1: JAIL_BOX.x1 - 1, z0: HALL.z1, z1: JAIL_BOX.z1 - 1 },
};
/** The way out: the lobby's front door. */
export const EXIT = { x: 1485, z: JAIL_BOX.z1 };
/** The fenced outdoor yard behind the jail (north). */
export const YARD = { x0: 1100, x1: 1510, z0: -280, z1: JAIL_BOX.z0 - 1 };

/** Every cell, by number (0…99): which row it's in, and its middle. */
export function cellAt(n: number) {
  const row = CELL_ROWS[Math.floor(n / CELLS_PER_ROW)];
  const i = n % CELLS_PER_ROW;
  return { row, i, x: CELL_X0 + CELL.w * (i + 0.5), z: (row.z0 + row.z1) / 2 };
}
/** Your cell: block B, halfway along (cell 38), well away from the way out. */
export const MY_CELL = CELLS_PER_ROW + 12;
const mine = cellAt(MY_CELL);
export const JAIL_SPAWN = { x: mine.x, z: mine.z - 1, yaw: Math.PI };
/** How long until your cell door opens. */
export const CELL_SECONDS = 30;

export type JailDoor = {
  id: string;
  /** Middle of the doorway. */
  x: number;
  z: number;
  /** Which wall it's in: one running along x (the door slides along x) or along z. */
  along: "x" | "z";
  half: number;
  kind: "cell" | "security" | "open";
};

/** Every doorway in the jail. */
export const JAIL_DOORS: JailDoor[] = [
  ...Array.from({ length: CELL_COUNT }, (_, n): JailDoor => {
    const c = cellAt(n);
    return { id: `cell-${n}`, x: c.x, z: c.row.z1, along: "x", half: 2, kind: "cell" };
  }),
  // Mess hall → main hall.
  { id: "mess", x: (MESS_HALL.x0 + MESS_HALL.x1) / 2, z: HALL.z0, along: "x", half: 6, kind: "open" },
  // Main hall → the rooms.
  { id: "gym", x: (JAIL_ROOMS.gym.x0 + JAIL_ROOMS.gym.x1) / 2, z: HALL.z1, along: "x", half: 4, kind: "open" },
  { id: "library", x: (JAIL_ROOMS.library.x0 + JAIL_ROOMS.library.x1) / 2, z: HALL.z1, along: "x", half: 3, kind: "open" },
  { id: "laundry", x: (JAIL_ROOMS.laundry.x0 + JAIL_ROOMS.laundry.x1) / 2, z: HALL.z1, along: "x", half: 3, kind: "open" },
  { id: "guards", x: (JAIL_ROOMS.guards.x0 + JAIL_ROOMS.guards.x1) / 2, z: HALL.z1, along: "x", half: 2.5, kind: "security" },
  { id: "lobby", x: EXIT.x, z: HALL.z1, along: "x", half: 2.5, kind: "security" },
  // Out the front, and out to the yard.
  { id: "exit", x: EXIT.x, z: JAIL_BOX.z1, along: "x", half: 3, kind: "security" },
  { id: "yard", x: (MESS_HALL.x0 + MESS_HALL.x1) / 2, z: JAIL_BOX.z0, along: "x", half: 3, kind: "security" },
];
export const CELL_DOORS = JAIL_DOORS.filter((d) => d.kind === "cell");

/** How open each door is right now (0 shut … 1 open). jail-state.ts moves them; jail.tsx draws them. */
export const doorOpen: Record<string, number> = Object.fromEntries(JAIL_DOORS.map((d) => [d.id, d.kind === "open" ? 1 : 0]));

// ---- Walls ----------------------------------------------------------------------------------

/** A wall along x at z, from x0 to x1, with gaps for any doors in it. */
function wallX(z: number, x0: number, x1: number, t = 1): Box[] {
  const gaps = JAIL_DOORS.filter((d) => d.along === "x" && Math.abs(d.z - z) < 0.6 && d.x > x0 && d.x < x1).sort((a, b) => a.x - b.x);
  const out: Box[] = [];
  let start = x0;
  for (const g of gaps) {
    if (g.x - g.half > start) out.push({ x: (start + g.x - g.half) / 2, z, hw: (g.x - g.half - start) / 2, hd: t / 2, turn: 0 });
    start = g.x + g.half;
  }
  if (x1 > start) out.push({ x: (start + x1) / 2, z, hw: (x1 - start) / 2, hd: t / 2, turn: 0 });
  return out;
}
const wallZ = (x: number, z0: number, z1: number, t = 1): Box => ({ x, z: (z0 + z1) / 2, hw: t / 2, hd: (z1 - z0) / 2, turn: 0 });

const B = JAIL_BOX;
/** The concrete walls (drawn solid). */
export const JAIL_SOLID: Box[] = [
  // Outside walls.
  ...wallX(B.z0, B.x0, B.x1),
  ...wallX(B.z1, B.x0, B.x1),
  wallZ(B.x0, B.z0, B.z1),
  wallZ(B.x1, B.z0, B.z1),
  // Each cell block: a back wall (the first one's is the outside wall), the walls between its cells, and one at the end (onto the mess hall).
  ...CELL_ROWS.flatMap((row) => [
    ...(row.r > 0 ? wallX(row.z0, B.x0, CELL_X1 + 0.25, 0.8) : []),
    ...Array.from({ length: CELLS_PER_ROW }, (_, i) => wallZ(CELL_X0 + CELL.w * (i + 1), row.z0, row.z1, 0.5)),
  ]),
  // The main hall's walls, and the walls between the rooms.
  ...wallX(HALL.z0, B.x0, B.x1),
  ...wallX(HALL.z1, B.x0, B.x1),
  ...[JAIL_ROOMS.gym.x1, JAIL_ROOMS.library.x1, JAIL_ROOMS.laundry.x1, JAIL_ROOMS.guards.x1].map((x) => wallZ(x, HALL.z1, B.z1)),
];
/** The cells' barred fronts (solid to bump into, drawn as bars). */
export const CELL_FRONTS: Box[] = CELL_ROWS.flatMap((row) => wallX(row.z1, CELL_X0 - 1, CELL_X1, 0.4));
/** Every wall, for bumping into. */
export const JAIL_WALLS: Box[] = [...JAIL_SOLID, ...CELL_FRONTS];

/** The yard's fence (you can't climb out). */
export const YARD_FENCE: Box[] = [
  { x: (YARD.x0 + YARD.x1) / 2, z: YARD.z0, hw: (YARD.x1 - YARD.x0) / 2, hd: 0.3, turn: 0 },
  { x: YARD.x0, z: (YARD.z0 + B.z0) / 2, hw: 0.3, hd: (B.z0 - YARD.z0) / 2, turn: 0 },
  { x: YARD.x1, z: (YARD.z0 + B.z0) / 2, hw: 0.3, hd: (B.z0 - YARD.z0) / 2, turn: 0 },
];

/** The whole place, fence and all, with a little room round it (for quick "is it anywhere near?" checks). */
export const JAIL_AREA = { x0: B.x0 - 20, x1: B.x1 + 20, z0: YARD.z0 - 10, z1: B.z1 + 10 };

export const inJailBuilding = (x: number, z: number) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
export const inYard = (x: number, z: number) => x > YARD.x0 && x < YARD.x1 && z > YARD.z0 && z <= B.z0;
export const inMyCell = (x: number, z: number) => Math.abs(x - JAIL_SPAWN.x) < CELL.w / 2 && z > mine.row.z0 && z < mine.row.z1;

/** Does a circle at (x, z) hit a jail wall, the yard fence, or a door that's shut? */
export function jailBlocks(x: number, z: number, r: number) {
  if (x < JAIL_AREA.x0 || x > JAIL_AREA.x1 || z < JAIL_AREA.z0 || z > JAIL_AREA.z1) return false;
  for (const w of JAIL_WALLS) if (hitsBox(x, z, r, w)) return true;
  for (const f of YARD_FENCE) if (hitsBox(x, z, r, f)) return true;
  for (const d of JAIL_DOORS) {
    if (d.kind === "open" || doorOpen[d.id] > 0.8) continue;
    if (hitsBox(x, z, r, { x: d.x, z: d.z, hw: d.half, hd: 0.4, turn: 0 })) return true;
  }
  for (const t of TABLE_BOXES) if (hitsBox(x, z, r, t)) return true;
  return false;
}

// ---- Guards ---------------------------------------------------------------------------------

const corridorZ = (r: number) => (CELL_ROWS[r].corridor.z0 + CELL_ROWS[r].corridor.z1) / 2;
const hallZ = (HALL.z0 + HALL.z1) / 2;
const M = MESS_HALL;
const R = JAIL_ROOMS;

/** Where each guard walks (back and forth on two points, round and round on more). */
export const GUARD_ROUTES: { x: number; z: number }[][] = [
  // One down each cell corridor (and out across the mess hall).
  ...CELL_ROWS.map((row) => [
    { x: CELL_X0 + 5, z: corridorZ(row.r) },
    { x: M.x1 - 8, z: corridorZ(row.r) },
  ]),
  // The mess hall.
  [
    { x: M.x0 + 10, z: M.z0 + 8 },
    { x: M.x1 - 6, z: M.z0 + 8 },
    { x: M.x1 - 6, z: M.z1 - 6 },
    { x: M.x0 + 10, z: M.z1 - 6 },
  ],
  // Two along the main hall, going opposite ways.
  [
    { x: B.x0 + 6, z: hallZ },
    { x: B.x1 - 6, z: hallZ },
  ],
  [
    { x: B.x1 - 6, z: hallZ + 2 },
    { x: B.x0 + 6, z: hallZ + 2 },
  ],
  // The yard.
  [
    { x: YARD.x0 + 20, z: YARD.z1 - 20 },
    { x: YARD.x1 - 20, z: YARD.z1 - 20 },
    { x: YARD.x1 - 20, z: YARD.z0 + 15 },
    { x: YARD.x0 + 20, z: YARD.z0 + 15 },
  ],
  [
    { x: 1300, z: -235 },
    { x: 1460, z: -255 },
  ],
  [
    { x: 1140, z: -255 },
    { x: 1260, z: -225 },
  ],
  // The gym.
  [
    { x: R.gym.x0 + 10, z: R.gym.z0 + 10 },
    { x: R.gym.x1 - 10, z: R.gym.z0 + 10 },
    { x: R.gym.x1 - 10, z: R.gym.z1 - 10 },
    { x: R.gym.x0 + 10, z: R.gym.z1 - 10 },
  ],
  [
    { x: R.gym.x0 + 20, z: -20 },
    { x: R.gym.x1 - 20, z: -20 },
  ],
  // The library and the laundry.
  [
    { x: R.library.x0 + 8, z: R.library.z0 + 12 },
    { x: R.library.x1 - 8, z: R.library.z1 - 12 },
  ],
  [
    { x: R.laundry.x0 + 8, z: R.laundry.z1 - 12 },
    { x: R.laundry.x1 - 8, z: R.laundry.z0 + 12 },
  ],
  // The guard room.
  [
    { x: R.guards.x0 + 10, z: R.guards.z0 + 12 },
    { x: R.guards.x1 - 10, z: R.guards.z1 - 14 },
  ],
  [
    { x: R.guards.x1 - 10, z: R.guards.z0 + 20 },
    { x: R.guards.x0 + 10, z: R.guards.z1 - 10 },
  ],
  // The lobby.
  [
    { x: R.lobby.x0 + 8, z: B.z1 - 24 },
    { x: R.lobby.x1 - 8, z: B.z1 - 24 },
  ],
  [
    { x: R.lobby.x0 + 12, z: R.lobby.z0 + 12 },
    { x: R.lobby.x1 - 10, z: R.lobby.z0 + 40 },
  ],
];

/** The mess hall's tables (long along x), between the lines the guards walk. */
export const MESS_TABLE = { w: 12, d: 3, bench: 2.6 };
export const MESS_TABLES: { x: number; z: number }[] = [-158, -134, -110].flatMap((z) => [M.x0 + 32, M.x0 + 72, M.x0 + 112, M.x0 + 152].map((x) => ({ x, z })));
const TABLE_BOXES: Box[] = MESS_TABLES.map((t) => ({ x: t.x, z: t.z, hw: MESS_TABLE.w / 2, hd: MESS_TABLE.d / 2, turn: 0 }));

/** Other inmates hanging about (they don't do anything; they're scenery): sitting at the mess hall tables, and out in the yard. */
export const INMATES: { x: number; z: number; yaw: number; sit: boolean }[] = [
  ...MESS_TABLES.flatMap((t, k) => [
    { x: t.x - 3 + (k % 3), z: t.z - MESS_TABLE.bench, yaw: Math.PI, sit: true },
    ...(k % 2 ? [{ x: t.x + 2.5, z: t.z + MESS_TABLE.bench, yaw: 0, sit: true }] : []),
  ]),
  ...Array.from({ length: 10 }, (_, k) => ({ x: YARD.x0 + 40 + k * 36, z: YARD.z0 + 30 + (k % 3) * 12, yaw: k * 1.7, sit: false })),
];
