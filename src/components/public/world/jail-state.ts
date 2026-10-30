import { banner } from "./heist";
import { notify } from "./game-events";
import { provide } from "./interact";
import { life } from "./life";
import { player } from "./you";
import { pockets } from "./profile";
import { CELL_SECONDS, EXIT, GUARD_ROUTES, JAIL_BOX, JAIL_DOORS, JAIL_ROOMS, JAIL_SPAWN, MY_CELL, doorOpen, inJailBuilding, inMyCell, inYard } from "./jail-layout";

const inLobby = (x: number, z: number) => x > JAIL_ROOMS.lobby.x0 && x < JAIL_ROOMS.lobby.x1 && z > JAIL_ROOMS.lobby.z0 && z < JAIL_ROOMS.lobby.z1;

/*
 * Doing time: what happens in jail. Plain TypeScript; jail.tsx draws it.
 *
 *   - You arrive in your cell in an orange jumpsuit. The cell door slides
 *     open after 30 seconds.
 *   - The guards patrol (the cell corridors, the mess hall, the main hall,
 *     the yard, the gym, library, laundry, guard room and lobby). Each has a
 *     keycard on their belt. Sneak up behind one and press F to pickpocket
 *     it. If they see you trying (you're in front of them), you're thrown
 *     back in your cell.
 *   - With a keycard, every security door slides open as you walk up.
 *   - Out through the lobby's front door, and you're free.
 */

export type Guard = { x: number; z: number; yaw: number; route: number; leg: number; dir: 1 | -1; keycard: boolean; speed: number; alert: number; walking: boolean };

export const jail = {
  /** When your cell door opens (seconds on the 3D clock), or -1. */
  cellOpensAt: -1,
  now: 0,
  guards: GUARD_ROUTES.map((r, i): Guard => ({ x: r[0].x, z: r[0].z, yaw: 0, route: i, leg: 0, dir: 1, keycard: true, speed: 3.4, alert: 0, walking: true })),
  /** Seconds left on your cell door (for the screen). */
  left: 0,
  /** Got as far as the lobby (so walking out of the front door is breaking out). */
  reachedLobby: false,
  /** How long you've been outside the jail without breaking out (a moment, and you're put back). */
  outside: 0,
};

/** Locked up: put in your cell (police.ts does the teleport). */
export function lockUp(now: number) {
  life.inJail = true;
  jail.reachedLobby = false;
  jail.outside = 0;
  jail.cellOpensAt = now + CELL_SECONDS;
  for (const d of JAIL_DOORS) if (d.kind !== "open") doorOpen[d.id] = 0;
  pockets.keycard = false;
  for (const g of jail.guards) g.keycard = true;
  notify();
}

function sentBack(now: number) {
  pockets.keycard = false;
  jail.cellOpensAt = now + CELL_SECONDS;
  for (const d of JAIL_DOORS) if (d.kind === "cell") doorOpen[d.id] = 0;
  Object.assign(player, { x: JAIL_SPAWN.x, z: JAIL_SPAWN.z, yaw: JAIL_SPAWN.yaw, hop: true, snap: true });
  banner("busted", "Caught!", "A guard saw you. Back to your cell for another 30 seconds.");
}

/** Where a guard is looking: are you in front of them and close? */
function sees(g: Guard, x: number, z: number, range: number) {
  const dx = x - g.x;
  const dz = z - g.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  // Facing: yaw 0 = looking toward -z (like you).
  const fx = Math.sin(g.yaw);
  const fz = -Math.cos(g.yaw);
  return (dx * fx + dz * fz) / Math.max(d, 0.01) > Math.cos(1.1);
}

function nearestGuard(x: number, z: number) {
  let best: Guard | null = null;
  let bd = Infinity;
  for (const g of jail.guards) {
    const d = Math.hypot(g.x - x, g.z - z);
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  return { guard: best, d: bd };
}

/** Every frame. */
export function tickJail(now: number, dt: number) {
  jail.now = now;
  // Guards walk their routes (and stop to stare at you for a moment if they're suspicious).
  for (const g of jail.guards) {
    const route = GUARD_ROUTES[g.route];
    g.alert = Math.max(0, g.alert - dt);
    const target = route[g.leg];
    const dx = target.x - g.x;
    const dz = target.z - g.z;
    const d = Math.hypot(dx, dz);
    g.walking = g.alert <= 0;
    if (g.walking) {
      if (d < 0.5) {
        // Next point (back and forth on two-point routes, round and round otherwise).
        if (route.length === 2) {
          g.leg = g.leg === 0 ? 1 : 0;
        } else g.leg = (g.leg + 1) % route.length;
      } else {
        const step = Math.min(d, g.speed * dt);
        g.x += (dx / d) * step;
        g.z += (dz / d) * step;
        const want = Math.atan2(dx, -dz);
        let turn = want - g.yaw;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        g.yaw += turn * Math.min(1, dt * 6);
      }
    } else {
      // Look at you.
      const want = Math.atan2(player.x - g.x, -(player.z - g.z));
      let turn = want - g.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      g.yaw += turn * Math.min(1, dt * 8);
    }
  }

  if (!life.inJail) {
    jail.left = 0;
    // (Out of jail the doors stay shut; nobody's there.)
    return;
  }

  // Your cell door.
  jail.left = Math.max(0, Math.ceil(jail.cellOpensAt - now));
  for (const d of JAIL_DOORS) {
    let want = doorOpen[d.id];
    if (d.kind === "cell") want = d.id === `cell-${MY_CELL}` ? (now >= jail.cellOpensAt ? 1 : 0) : 0;
    else if (d.kind === "security") {
      // Opens for you with a keycard, and for a guard walking through.
      const you = pockets.keycard && Math.hypot(player.x - d.x, player.z - d.z) < 4.5;
      const guard = jail.guards.some((g) => Math.hypot(g.x - d.x, g.z - d.z) < 3.5);
      want = you || guard ? 1 : 0;
    }
    const k = Math.min(1, dt * 3);
    doorOpen[d.id] += (want - doorOpen[d.id]) * k;
  }

  const inside = inJailBuilding(player.x, player.z) || inYard(player.x, player.z);
  // Remember getting as far as the lobby (the only way out is through its front door).
  if (inLobby(player.x, player.z)) jail.reachedLobby = true;
  // Free: out of the front door, from the lobby.
  if (!inside && jail.reachedLobby && player.z > JAIL_BOX.z1 && player.z < JAIL_BOX.z1 + 30 && Math.abs(player.x - EXIT.x) < 20) {
    life.inJail = false;
    pockets.keycard = false;
    jail.reachedLobby = false;
    banner("escaped", "You broke out!", "Free again. Lie low for a while.");
    notify();
    return;
  }
  // Anywhere else outside the jail (however you got there): that's not how it works. Back to your cell.
  jail.outside = inside || player.hop ? 0 : jail.outside + dt;
  if (jail.outside > 0.4) {
    jail.outside = 0;
    jail.reachedLobby = false;
    pockets.keycard = false;
    for (const d of JAIL_DOORS) if (d.kind === "cell") doorOpen[d.id] = 0;
    Object.assign(player, { x: JAIL_SPAWN.x, z: JAIL_SPAWN.z, yaw: JAIL_SPAWN.yaw, hop: true, snap: true });
    banner("busted", "Nice try!", "You're doing time. The only way out is to break out through the lobby.");
    notify();
    return;
  }
  // Somewhere you shouldn't be without a keycard (and a guard can see you): back to your cell.
  if (!pockets.keycard) return;
  for (const g of jail.guards) {
    if (sees(g, player.x, player.z, 5) && g.alert <= 0 && Math.random() < dt * 0.6) {
      // A guard who spots you with their mate's keycard: caught.
      sentBack(now);
      return;
    }
  }
}

// ---- Pickpocketing (F) ------------------------------------------------------------------------

provide("jail", () => {
  if (!life.inJail) return null;
  if (!inJailBuilding(player.x, player.z) && !inYard(player.x, player.z)) return null;
  if (inMyCell(player.x, player.z) && jail.left > 0) return null;
  if (pockets.keycard) return null;
  const { guard, d } = nearestGuard(player.x, player.z);
  if (!guard || d > 2.2 || !guard.keycard) return null;
  return {
    key: "F",
    text: "Pickpocket the keycard",
    tone: "crime",
    run: () => {
      // From behind it works; in front of them, they catch you.
      if (sees(guard, player.x, player.z, 6)) {
        guard.alert = 2;
        sentBack(jail.now);
        return;
      }
      guard.keycard = false;
      pockets.keycard = true;
      player.anim.reach = 1;
      setTimeout(() => (player.anim.reach = 0), 500);
      banner("info", "Got the keycard!", "Security doors will open for you now. Head for the lobby exit.");
      notify();
    },
  };
});
