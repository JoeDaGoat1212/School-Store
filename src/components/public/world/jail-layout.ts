import { hitsBox, type Box } from "./town-layout";

/*
 * The jail, east of the city at the end of the main road. Plain numbers (no
 * 3D code); jail.tsx draws it.
 *
 *      N (-z)
 *   ┌──────────────────────────────┬──────────── YARD (outside, fenced) ─┐
 *   │ cells 1–10 (barred doors)    │  door to the yard (keycard)        │
 *   ├──────────── corridor ────────┴─────────────────────────────────────┤
 *   │  GYM (open doorway)  │ GUARD ROOM (keycard) │ LOBBY (keycard)      │
 *   └──────────────────────┴──────────────────────┴────── exit (keycard)─┘
 *      S (+z): the main road
 *
 * You start in cell 5. Its door slides open after 30 seconds. Every other
 * door is a security door that only opens for a keycard, and the guards
 * have the keycards: sneak up behind one and pickpocket it (F). Get out
 * through the lobby's front door and you're free.
 */

export const JAIL_BOX = { x0: 1250, x1: 1450, z0: -40, z1: 30, h: 10, wall: 1 };
export const CELL_ROW = { x0: 1251, w: 10, count: 10, z0: -39, z1: -25 };
export const CORRIDOR = { z0: -25, z1: -15 };
/** The rooms along the south side. */
export const JAIL_ROOMS = {
  gym: { x0: 1251, x1: 1330, z0: -15, z1: 29 },
  guards: { x0: 1330, x1: 1390, z0: -15, z1: 29 },
  lobby: { x0: 1390, x1: 1449, z0: -15, z1: 29 },
};
/** The fenced outdoor yard behind the jail (north). */
export const YARD = { x0: 1262, x1: 1440, z0: -92, z1: -41 };

/** Your cell (5th from the west), and where you stand in it. */
export const MY_CELL = 4;
const cellMid = (i: number) => CELL_ROW.x0 + CELL_ROW.w * (i + 0.5);
export const JAIL_SPAWN = { x: cellMid(MY_CELL), z: (CELL_ROW.z0 + CELL_ROW.z1) / 2 - 1, yaw: Math.PI };
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
  ...Array.from({ length: CELL_ROW.count }, (_, i): JailDoor => ({ id: `cell-${i}`, x: cellMid(i), z: CELL_ROW.z1, along: "x", half: 2, kind: "cell" })),
  { id: "gym", x: 1290, z: CORRIDOR.z1, along: "x", half: 3.5, kind: "open" },
  { id: "guards", x: 1360, z: CORRIDOR.z1, along: "x", half: 2.5, kind: "security" },
  { id: "lobby", x: 1420, z: CORRIDOR.z1, along: "x", half: 2.5, kind: "security" },
  { id: "exit", x: 1420, z: JAIL_BOX.z1, along: "x", half: 3, kind: "security" },
  { id: "yard", x: 1400, z: JAIL_BOX.z0, along: "x", half: 2.5, kind: "security" },
];

/** How open each door is right now (0 shut … 1 open). jail.ts moves them; jail.tsx draws them. */
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
  // The walls between the cells.
  ...Array.from({ length: CELL_ROW.count }, (_, i) => wallZ(CELL_ROW.x0 + CELL_ROW.w * (i + 1), CELL_ROW.z0, CELL_ROW.z1, 0.5)),
  // The corridor's south wall, and the walls between the rooms.
  ...wallX(CORRIDOR.z1, B.x0, B.x1),
  wallZ(JAIL_ROOMS.gym.x1, CORRIDOR.z1, B.z1),
  wallZ(JAIL_ROOMS.guards.x1, CORRIDOR.z1, B.z1),
];
/** The cells' barred fronts (solid to bump into, drawn as bars). */
export const CELL_FRONTS: Box[] = wallX(CELL_ROW.z1, B.x0, CELL_ROW.x0 + CELL_ROW.w * CELL_ROW.count, 0.4);
/** Every wall, for bumping into. */
export const JAIL_WALLS: Box[] = [...JAIL_SOLID, ...CELL_FRONTS];

/** The yard's fence (you can't climb out). */
export const YARD_FENCE: Box[] = [
  { x: (YARD.x0 + YARD.x1) / 2, z: YARD.z0, hw: (YARD.x1 - YARD.x0) / 2, hd: 0.3, turn: 0 },
  { x: YARD.x0, z: (YARD.z0 + B.z0) / 2, hw: 0.3, hd: (B.z0 - YARD.z0) / 2, turn: 0 },
  { x: YARD.x1, z: (YARD.z0 + B.z0) / 2, hw: 0.3, hd: (B.z0 - YARD.z0) / 2, turn: 0 },
];

export const inJailBuilding = (x: number, z: number) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
export const inYard = (x: number, z: number) => x > YARD.x0 && x < YARD.x1 && z > YARD.z0 && z < B.z0;
export const inMyCell = (x: number, z: number) => Math.abs(x - JAIL_SPAWN.x) < CELL_ROW.w / 2 && z > CELL_ROW.z0 && z < CELL_ROW.z1;

/** Does a circle at (x, z) hit a jail wall, the yard fence, or a door that's shut? */
export function jailBlocks(x: number, z: number, r: number) {
  if (x < B.x0 - 20 || x > B.x1 + 20 || z < YARD.z0 - 10 || z > B.z1 + 10) return false;
  for (const w of JAIL_WALLS) if (hitsBox(x, z, r, w)) return true;
  for (const f of YARD_FENCE) if (hitsBox(x, z, r, f)) return true;
  for (const d of JAIL_DOORS) {
    if (d.kind === "open" || doorOpen[d.id] > 0.8) continue;
    if (hitsBox(x, z, r, { x: d.x, z: d.z, hw: d.half, hd: 0.4, turn: 0 })) return true;
  }
  return false;
}

// ---- Guards ---------------------------------------------------------------------------------

/** Where each guard walks (back and forth along the points). */
export const GUARD_ROUTES: { x: number; z: number }[][] = [
  // The corridor.
  [
    { x: 1258, z: -20 },
    { x: 1440, z: -20 },
  ],
  // The yard.
  [
    { x: 1280, z: -60 },
    { x: 1420, z: -60 },
    { x: 1420, z: -80 },
    { x: 1280, z: -80 },
  ],
  // The gym.
  [
    { x: 1262, z: 0 },
    { x: 1318, z: 0 },
    { x: 1318, z: 20 },
    { x: 1262, z: 20 },
  ],
  // The lobby.
  [
    { x: 1400, z: 6 },
    { x: 1440, z: 6 },
  ],
  // The guard room.
  [
    { x: 1340, z: 0 },
    { x: 1380, z: 18 },
  ],
];
