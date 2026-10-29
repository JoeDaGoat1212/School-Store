import { carBlocked, copSpots, player, walkBlocked } from "./bump";
import { newLook, type CarLook } from "./car-model";
import { drive } from "./drive";
import { notify } from "./game-events";
import { banner, busted, game } from "./heist";
import { lockUp } from "./jail-state";
import { JAIL_SPAWN } from "./jail-layout";
import { life } from "./life";
import { ROADS } from "./town-layout";
import { WORLD_BOUNDS } from "./world-map";

/*
 * The police. Plain TypeScript; police.tsx draws them.
 *
 *   - Once you've set off an alarm, squad cars come after you (two at first,
 *     up to four the longer it goes on). They turn up on the roads nearby
 *     and drive straight for you.
 *   - On foot, when one gets close it screeches to a stop and an officer
 *     jumps out and runs after you. Run! (Shift: you're a little faster than
 *     them.) If they catch you: hands up, handcuffs, walked to the car, put
 *     in the back, and off to jail.
 *   - In a car: if you stop with a squad car right on you, they pull you out.
 *   - When the chase is over (you stashed the loot, ran out of time, or got
 *     caught) the rest drive off.
 */

const MAX_UNITS = 4;
const CRUISE = 34;
/** On foot, an officer runs at this speed (you run at 12). */
const OFFICER_RUN = 10.8;

export type Officer = { active: boolean; x: number; z: number; yaw: number; speed: number; phase: number };
export type Unit = {
  on: boolean;
  x: number;
  z: number;
  heading: number;
  speed: number;
  look: CarLook;
  mode: "chase" | "stopped" | "leave" | "arrest";
  /** Backing up for this long (stuck on something). */
  reverse: number;
  officer: Officer;
  leaveAt: number;
};

const newUnit = (): Unit => ({
  on: false,
  x: 0,
  z: 0,
  heading: 0,
  speed: 0,
  look: newLook(),
  mode: "chase",
  reverse: 0,
  officer: { active: false, x: 0, z: 0, yaw: 0, speed: 0, phase: 0 },
  leaveAt: 0,
});

export const police = {
  units: Array.from({ length: MAX_UNITS }, newUnit),
  /** The arrest cutscene: which unit, and when it started (or null). */
  arrest: null as null | { unit: number; t0: number; view: "first" | "third"; zoom: number },
  /** How dark the screen is (0…1), for the fade to jail. */
  fade: 0,
  /** Pull the player out of their car (world-app.tsx watches this). */
  forceOut: false,
  /** When the next squad car turns up. */
  nextSpawn: 0,
  /** Seconds the player's car has been stopped with a squad car right on it. */
  pinned: 0,
};

const you = () => (drive.active ? { x: drive.pos.x, z: drive.pos.z, inCar: true } : { x: player.x, z: player.z, inCar: false });

/** A spot on a road 140–220 units from you (or anywhere clear, in the mountains). */
function spawnSpot(px: number, pz: number) {
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 140 + Math.random() * 80;
    let x = px + Math.sin(a) * d;
    let z = pz + Math.cos(a) * d;
    let heading = Math.atan2(-(px - x), -(pz - z));
    // Snap onto the nearest road if there's one close by.
    for (const r of ROADS) {
      const along = r.axis === "x" ? x : z;
      const across = r.axis === "x" ? z : x;
      if (Math.abs(across - r.at) < 40 && along > r.from && along < r.to) {
        if (r.axis === "x") z = r.at;
        else x = r.at;
        heading = Math.atan2(-(px - x), -(pz - z));
        break;
      }
    }
    if (x < WORLD_BOUNDS.minX + 10 || x > WORLD_BOUNDS.maxX - 10 || z < WORLD_BOUNDS.minZ + 10 || z > WORLD_BOUNDS.maxZ - 10) continue;
    const spot = { x, z, heading };
    if (!carBlocked(spot, { x: -1e6, z: -1e6, heading: 0 }, [])) return spot;
  }
  return null;
}

function setSpot(i: number, u: Unit) {
  if (u.on) Object.assign(copSpots[i], { x: u.x, z: u.z, heading: u.heading });
  else Object.assign(copSpots[i], { x: -9999, z: -9999, heading: 0 });
}

const angleTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Every frame. */
export function tickPolice(now: number, dt: number) {
  const p = you();
  const wanted = Boolean(game.wanted) && !life.dead && !life.inJail;

  // ---- The arrest cutscene ----
  if (police.arrest) {
    arrestStep(now, dt);
    return;
  }

  // ---- Squad cars turn up ----
  if (wanted) {
    const count = police.units.filter((u) => u.on && u.mode !== "leave").length;
    const want = Math.min(MAX_UNITS, 2 + Math.floor((now - game.wanted!.startedAt) / 30));
    if (police.nextSpawn === 0) police.nextSpawn = now + 4;
    if (count < want && now >= police.nextSpawn) {
      const i = police.units.findIndex((u) => !u.on);
      const spot = i >= 0 ? spawnSpot(p.x, p.z) : null;
      if (spot) {
        const u = police.units[i];
        Object.assign(u, newUnit(), { on: true, x: spot.x, z: spot.z, heading: spot.heading, speed: 20, look: u.look });
      }
      police.nextSpawn = now + 6;
    }
  } else {
    police.nextSpawn = 0;
    for (const u of police.units)
      if (u.on && u.mode !== "leave") {
        u.mode = "leave";
        u.leaveAt = now;
        u.officer.active = false;
      }
  }

  // ---- Each squad car ----
  police.units.forEach((u, i) => {
    if (!u.on) return setSpot(i, u);
    const dist = Math.hypot(p.x - u.x, p.z - u.z);
    let wantSpeed = 0;
    let wantHeading = u.heading;

    if (u.mode === "leave") {
      // Drive off away from you, then vanish.
      wantHeading = angleTo(u, { x: u.x + (u.x - p.x), z: u.z + (u.z - p.z) });
      wantSpeed = CRUISE;
      if (now - u.leaveAt > 8 || dist > 320) {
        u.on = false;
        return setSpot(i, u);
      }
    } else if (u.mode === "chase") {
      wantHeading = angleTo(u, p);
      wantSpeed = dist > 70 ? CRUISE : dist > 30 ? 24 : p.inCar ? 16 : 10;
      // On foot and close: stop, and send the officer after you.
      if (!p.inCar && dist < 22) {
        u.mode = "stopped";
        const side = 3.4;
        Object.assign(u.officer, { active: true, x: u.x + Math.cos(u.heading) * -side, z: u.z - Math.sin(u.heading) * -side, yaw: 0, speed: 0 });
      }
    } else if (u.mode === "stopped") {
      wantSpeed = 0;
      // Got back in a car and drove off: the officer gets back in and they give chase again.
      if (p.inCar || Math.hypot(p.x - u.officer.x, p.z - u.officer.z) > 75) {
        const back = Math.hypot(u.officer.x - u.x, u.officer.z - u.z);
        stepOfficer(u.officer, u, dt, OFFICER_RUN);
        if (back < 2.5) {
          u.officer.active = false;
          u.mode = "chase";
        }
      } else {
        stepOfficer(u.officer, p, dt, OFFICER_RUN);
        if (Math.hypot(p.x - u.officer.x, p.z - u.officer.z) < 1.5) startArrest(i, now);
      }
    }

    // Steer and drive (slowing for sharp turns), dodging whatever's in the way.
    const turn = wrap(wantHeading - u.heading);
    u.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, turn));
    if (Math.abs(turn) > 1.2) wantSpeed = Math.min(wantSpeed, 12);
    if (u.reverse > 0) {
      u.reverse -= dt;
      wantSpeed = -7;
    }
    u.speed += (wantSpeed - u.speed) * Math.min(1, dt * (wantSpeed < u.speed ? 4 : 1.6));
    if (Math.abs(u.speed) > 0.05) {
      const self = copSpots[i];
      let moved = false;
      for (const off of [0, 0.5, -0.5, 1, -1]) {
        const h = u.heading + off;
        const next = { x: u.x + -Math.sin(h) * u.speed * dt, z: u.z + -Math.cos(h) * u.speed * dt, heading: u.heading };
        if (!carBlocked(next, self, [])) {
          u.x = next.x;
          u.z = next.z;
          if (off) u.heading += off * dt * 2;
          moved = true;
          break;
        }
      }
      if (!moved && u.reverse <= 0 && u.mode !== "stopped") {
        u.reverse = 0.9;
        u.speed = 0;
      }
    }
    u.look.spin += (u.speed / 0.75) * dt;
    u.look.braking = wantSpeed < u.speed - 1 || u.mode === "stopped";
    u.look.reversing = u.speed < -0.3;
    u.look.steer = Math.max(-0.5, Math.min(0.5, turn));
    setSpot(i, u);
  });

  // ---- Pinned in your car: they pull you out ----
  if (wanted && p.inCar) {
    const close = police.units.some((u) => u.on && u.mode === "chase" && Math.hypot(u.x - p.x, u.z - p.z) < 8);
    police.pinned = close && Math.abs(drive.speed) < 2 ? police.pinned + dt : 0;
    if (police.pinned > 2.5) {
      police.pinned = 0;
      police.forceOut = true;
      notify();
      const i = police.units.findIndex((u) => u.on && Math.hypot(u.x - p.x, u.z - p.z) < 8);
      if (i >= 0) {
        const u = police.units[i];
        Object.assign(u.officer, { active: true, x: p.x + 3, z: p.z + 1, yaw: 0, speed: 0 });
        startArrest(i, now);
      }
    }
  } else police.pinned = 0;
}

/** An officer runs toward a spot, sliding round obstacles. */
function stepOfficer(o: Officer, to: { x: number; z: number }, dt: number, speed: number) {
  const dx = to.x - o.x;
  const dz = to.z - o.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) {
    o.speed = 0;
    return;
  }
  const step = Math.min(d, speed * dt);
  const mx = (dx / d) * step;
  const mz = (dz / d) * step;
  if (!walkBlocked(o.x + mx, o.z + mz, [])) {
    o.x += mx;
    o.z += mz;
  } else if (!walkBlocked(o.x + mx, o.z, [])) o.x += mx;
  else if (!walkBlocked(o.x, o.z + mz, [])) o.z += mz;
  else {
    // Squeeze through (an officer never gets stuck for long).
    o.x += mx * 0.5;
    o.z += mz * 0.5;
  }
  o.yaw = Math.atan2(dx, -dz);
  o.speed = speed;
  o.phase += speed * dt * 1.25;
}

// ---- The arrest ----------------------------------------------------------------------------

function startArrest(unit: number, now: number) {
  if (police.arrest) return;
  const lost = busted();
  police.arrest = { unit, t0: now, view: player.view, zoom: player.zoom };
  player.frozen = true;
  player.showBody = true;
  player.view = "third";
  player.zoom = 7;
  banner("busted", "Busted!", lost > 0 ? "You're under arrest. The loot's gone." : "You're under arrest!");
  notify();
}

function arrestStep(now: number, dt: number) {
  const a = police.arrest!;
  const u = police.units[a.unit];
  const o = u.officer;
  const t = now - a.t0;
  const anim = player.anim;
  // 0–1 s: hands up while the officer comes round behind you.
  if (t < 1.1) {
    anim.handsUp = Math.min(1, t * 3);
    const behind = { x: player.x + Math.sin(player.yaw) * -1.1, z: player.z - Math.cos(player.yaw) * -1.1 };
    stepOfficer(o, behind, dt, 6);
  } else if (t < 2.7) {
    // 1–2.7 s: handcuffed.
    anim.handsUp = Math.max(0, 1 - (t - 1.1) * 3);
    anim.cuffed = Math.min(1, (t - 1.1) * 2);
    o.speed = 0;
    o.yaw = player.yaw;
  } else if (t < 6) {
    // 2.7–6 s: walked to the back door of the squad car.
    const door = { x: u.x + Math.cos(u.heading) * 2.6 + -Math.sin(u.heading) * -0.6, z: u.z - Math.sin(u.heading) * 2.6 + -Math.cos(u.heading) * -0.6 };
    const dx = door.x - player.x;
    const dz = door.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.3) {
      const step = Math.min(d, 3.2 * dt);
      player.x += (dx / d) * step;
      player.z += (dz / d) * step;
      player.yaw = Math.atan2(dx, -dz);
      player.speed = 3.2;
    } else player.speed = 0;
    stepOfficer(o, { x: player.x - Math.sin(player.yaw) * 1.1, z: player.z + Math.cos(player.yaw) * 1.1 }, dt, 3.5);
  } else if (t < 8.6) {
    // 6–8.6 s: in the back, off we go, fade to black.
    player.hidden = true;
    player.speed = 0;
    o.active = false;
    u.mode = "arrest";
    u.speed = Math.min(20, u.speed + dt * 10);
    u.heading += dt * 0.15;
    const fx = -Math.sin(u.heading);
    const fz = -Math.cos(u.heading);
    u.x += fx * u.speed * dt;
    u.z += fz * u.speed * dt;
    u.look.spin += (u.speed / 0.75) * dt;
    police.fade = Math.min(1, Math.max(0, (t - 6.6) / 1.4));
    setSpot(a.unit, u);
  } else if (t < 10) {
    // In jail.
    if (!life.inJail) {
      for (const unit of police.units) unit.on = false;
      police.units.forEach((unit, i) => setSpot(i, unit));
      Object.assign(player, { x: JAIL_SPAWN.x, z: JAIL_SPAWN.z, yaw: JAIL_SPAWN.yaw, hop: true, snap: true, hidden: false, showBody: false });
      Object.assign(anim, { handsUp: 0, cuffed: 0 });
      player.view = a.view;
      player.zoom = a.zoom;
      lockUp(now);
      banner("busted", "Jail", "Your cell opens in 30 seconds. The guards have keycards…", 5);
    }
    police.fade = Math.max(0, 1 - (t - 8.8) / 1.2);
  } else {
    police.fade = 0;
    police.arrest = null;
    player.frozen = false;
    notify();
  }
}
