import { BANK_LOOT_BOXES, BANK_PLAN as P, CAMERAS, GUARD_ROUTE, bankDoors, cameraSees, inAnte, inBank, inHall, inSecurityRoom, toLocal, toWorld } from "./bank-layout";
import { sound } from "./city-audio";
import { notify } from "./game-events";
import { banner, game, isClosed, isTaken, soundAlarm, vaultOpen } from "./heist";
import { provide } from "./interact";
import { life } from "./life";
import { pockets } from "./profile";
import { player } from "./you";

/*
 * The hard parts of robbing City Bank (heist.ts has the rest: the alarm,
 * the loot, the deadline). Plain TypeScript; bank.tsx draws it.
 *
 *   1. The security officer patrolling the banking hall has a keycard on
 *      his belt. Sneak up behind him and pickpocket it (F). Every so often
 *      he stops and looks round: if he sees you trying, it's the alarm.
 *      And he'll notice it's gone after a couple of minutes, so be quick.
 *   2. The keycard opens the staff door at the end of the counter.
 *   3. Security cameras watch the staff area and the vault level. If one
 *      sees you for more than a moment: alarm. Or loop them first, at the
 *      CCTV desk in the security room (hold still for a few seconds).
 *   4. Down the ramp, through the laser corridor: the gates blink on and
 *      off (go when they're off) and a low beam sweeps along it (jump it).
 *      Touch a laser and you're dead.
 *   5. Drill the vault door (R). That sets the alarm off, and takes 40
 *      seconds, and you have to stay with the drill. Then the vault opens.
 */

/** How long the drill takes to get through the vault door (seconds). */
export const DRILL_TIME = 40;
/** How long you have to stay at the CCTV desk to loop the cameras. */
export const LOOP_TIME = 6;
/** How long before the officer notices his keycard's gone. */
export const NOTICE_AFTER = 150;
/** How long a camera has to see you before it raises the alarm. */
const SPOT_TIME = 1.1;

export type BankGuard = { x: number; z: number; yaw: number; leg: number; lookUntil: number; nextLook: number; keycard: boolean; walking: boolean; alert: number };

const freshGuard = (): BankGuard => ({ x: GUARD_ROUTE[0].x, z: GUARD_ROUTE[0].z, yaw: 0, leg: 1, lookUntil: 0, nextLook: 8, keycard: true, walking: true, alert: 0 });

export const bank = {
  /** Seconds the drill's been going (-1: not started). */
  drill: -1,
  /** Seconds spent looping the cameras (-1: not doing it). */
  loop: -1,
  /** The cameras show a loop of an empty room until this time (real time, ms). */
  loopedUntil: 0,
  /** How long a camera's been watching you. */
  seen: 0,
  /** How open the staff door and the fire exit are (0…1). */
  staffOpen: 0,
  fireOpen: 0,
  guard: freshGuard(),
  /** When you took the keycard (-1: you haven't). */
  cardAt: -1,
  /** The officer is looking round right now. */
  looking: false,
};

export function resetBank() {
  Object.assign(bank, { drill: -1, loop: -1, seen: 0, staffOpen: 0, fireOpen: 0, guard: freshGuard(), cardAt: -1, looking: false });
  pockets.bankCard = false;
}

export const camerasLooped = () => bank.loopedUntil > game.wallClock;
export const drilling = () => bank.drill >= 0 && game.sites.bank.vaultAt < 0;

// The doors and the loot, for bumping into (bank-layout.ts asks).
bankDoors.staff = () => bank.staffOpen > 0.7;
bankDoors.fire = () => bank.fireOpen > 0.7;
bankDoors.vault = () => vaultOpen();
bankDoors.loot = (id) => (isTaken(id) ? null : BANK_LOOT_BOXES[id]);

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Every frame (heist.ts calls this). Returns true if the screen needs re-drawing. */
export function tickBank(now: number, dt: number, you: { x: number; z: number; onFoot: boolean }) {
  let dirty = false;
  const site = game.sites.bank;
  const g = bank.guard;
  const near = Math.abs(you.x - toWorld(0, 0).x) < 120 && Math.abs(you.z - toWorld(0, 0).z) < 120;

  // ---- The security officer on patrol ----
  if (near) {
    if (site.alarm) {
      // Alarm: he stands his ground by the counter, gun out.
      g.walking = false;
      g.alert = Math.min(1, g.alert + dt * 3);
      const t = toWorld(0, -15);
      g.yaw = Math.atan2(you.x - g.x, you.z - g.z);
      const d = Math.hypot(t.x - g.x, t.z - g.z);
      if (d > 0.5) {
        g.x += ((t.x - g.x) / d) * Math.min(d, 6 * dt);
        g.z += ((t.z - g.z) / d) * Math.min(d, 6 * dt);
      }
    } else if (now < g.lookUntil) {
      // Stopped, turning round to look about.
      g.walking = false;
      g.yaw += dt * 1.6;
    } else {
      g.walking = true;
      g.alert = Math.max(0, g.alert - dt);
      const target = GUARD_ROUTE[g.leg];
      const dx = target.x - g.x;
      const dz = target.z - g.z;
      const d = Math.hypot(dx, dz);
      const step = 2.6 * dt;
      if (d <= step) {
        g.x = target.x;
        g.z = target.z;
        g.leg = (g.leg + 1) % GUARD_ROUTE.length;
      } else {
        g.x += (dx / d) * step;
        g.z += (dz / d) * step;
        g.yaw = Math.atan2(dx, dz);
      }
      if (now > g.nextLook) {
        g.lookUntil = now + 3.2;
        g.nextLook = now + 7 + Math.random() * 6;
      }
    }
    const looking = now < g.lookUntil;
    if (looking !== bank.looking) {
      bank.looking = looking;
      dirty = true;
    }
  }

  // ---- He notices his keycard's gone ----
  if (bank.cardAt >= 0 && !site.alarm && now - bank.cardAt > NOTICE_AFTER) {
    bank.cardAt = -1;
    pockets.bankCard = false;
    soundAlarm("bank", "The security officer noticed his keycard was gone! Police are on the way.");
    dirty = true;
  }

  // ---- The staff door (keycard from the hall; always opens from the staff side) and the fire exit (from inside) ----
  const sd = toWorld(P.staffDoor.lx, P.staffDoor.lz);
  const atStaff = player.level === 1 && Math.hypot(you.x - sd.x, you.z - sd.z) < 3.4;
  const staffSide = toLocal(you.x, you.z).lz < P.counter.lz0;
  const openStaff = atStaff && (pockets.bankCard || staffSide || isClosed("bank"));
  bank.staffOpen = Math.max(0, Math.min(1, bank.staffOpen + (openStaff ? dt * 2.5 : -dt * 1.5)));
  const fd = toWorld(P.halfW, P.fireExit.lz);
  const atFire = player.level === 1 && Math.hypot(you.x - fd.x, you.z - fd.z) < 3.2;
  bank.fireOpen = Math.max(0, Math.min(1, bank.fireOpen + (atFire ? dt * 2.5 : -dt * 1.2)));

  // ---- The cameras ----
  if (!site.alarm && !isClosed("bank") && you.onFoot && !life.dead && inBank(you.x, you.z) && !camerasLooped()) {
    const seen = CAMERAS.some((c) => cameraSees(c, now, you.x, you.z));
    bank.seen = seen ? bank.seen + dt : Math.max(0, bank.seen - dt * 2);
    if (bank.seen > SPOT_TIME) {
      bank.seen = 0;
      soundAlarm("bank", "A security camera spotted you! Police are on the way.");
      dirty = true;
    }
  } else bank.seen = 0;

  // ---- Looping the cameras ----
  if (bank.loop >= 0) {
    const desk = toWorld(P.cctv.lx, P.cctv.lz + 1.6);
    if (Math.hypot(you.x - desk.x, you.z - desk.z) > 3.2 || !inSecurityRoom(you.x, you.z)) {
      bank.loop = -1;
      banner("info", "Stopped", "You walked away from the CCTV desk.", 2);
      dirty = true;
    } else {
      bank.loop += dt;
      if (bank.loop >= LOOP_TIME) {
        bank.loop = -1;
        bank.loopedUntil = game.wallClock + 12 * 60 * 1000;
        banner("info", "Cameras looped", "Every camera is now showing an empty room. Nobody's watching.", 3.5);
        sound.cash();
        dirty = true;
      }
    }
  }

  // ---- Drilling the vault door ----
  if (drilling()) {
    const door = toWorld(P.vaultDoor.lx, P.vaultWall.lz0 - 2);
    const with_ = player.level === 0 && Math.hypot(you.x - door.x, you.z - door.z) < 7;
    if (with_) {
      bank.drill += dt;
      if (Math.floor(bank.drill / 0.12) !== Math.floor((bank.drill - dt) / 0.12)) game.fx.push({ kind: "sparks", x: door.x + 1.2, y: P.vaultDoor.y + 0.8, z: door.z + 1.6, count: 2 });
      game.shake = Math.max(game.shake, 0.04);
    }
    if (bank.drill >= DRILL_TIME) {
      site.vaultAt = now;
      banner("alarm", "The vault's open!", "Grab the gold and cash. Jump the floor lasers!", 3);
      sound.drill();
      dirty = true;
    }
    if (Math.floor(bank.drill) !== Math.floor(bank.drill - dt)) dirty = true;
  }

  if (dirty) notify();
  return dirty;
}

function startDrill() {
  if (bank.drill >= 0) return;
  bank.drill = 0;
  soundAlarm("bank", "The drill set the alarm off! Stay with it till the vault opens, then grab the loot.");
  // Drilling takes a while: more time on the clock to get the loot away.
  if (game.wanted) game.wanted.until = Math.max(game.wanted.until, game.now + DRILL_TIME + 240);
  sound.drill();
  notify();
}

function pickpocket() {
  const g = bank.guard;
  // Seen? (He's looking round, or you're in front of him.)
  const toYou = Math.atan2(player.x - g.x, player.z - g.z);
  const inFront = Math.abs(wrap(toYou - g.yaw)) < 1.2;
  if (game.now < g.lookUntil || inFront) {
    g.lookUntil = 0;
    g.yaw = toYou;
    soundAlarm("bank", "The officer caught your hand in his pocket! Police are on the way.");
    return;
  }
  g.keycard = false;
  pockets.bankCard = true;
  bank.cardAt = game.now;
  banner("info", "Got his keycard", "It opens the staff door behind the counter. He'll notice it's gone in a couple of minutes.", 4);
  notify();
}

provide("bank", (you) => {
  if (!you.onFoot || life.dead || isClosed("bank") || !inBank(you.x, you.z)) return null;
  const out = [];
  const g = bank.guard;
  const site = game.sites.bank;
  // Pickpocketing the officer: from behind, while he's not looking.
  if (g.keycard && !site.alarm && inHall(you.x, you.z) && Math.hypot(you.x - g.x, you.z - g.z) < 2.4) out.push({ key: "F" as const, text: bank.looking ? "Pickpocket his keycard (he's looking round!)" : "Pickpocket the officer's keycard", tone: "crime" as const, run: pickpocket });
  // The staff door, without a keycard.
  const sd = toWorld(P.staffDoor.lx, P.staffDoor.lz + 1.5);
  if (!pockets.bankCard && player.level === 1 && Math.hypot(you.x - sd.x, you.z - sd.z) < 3.4 && toLocal(you.x, you.z).lz > P.counter.lz1)
    out.push({ key: "E" as const, text: "Staff only: needs a keycard", run: () => banner("info", "Locked", "The reader wants a staff keycard. The security officer has one on his belt.", 3) });
  // The CCTV desk.
  const desk = toWorld(P.cctv.lx, P.cctv.lz + 1.6);
  if (inSecurityRoom(you.x, you.z) && Math.hypot(you.x - desk.x, you.z - desk.z) < 3.2 && !camerasLooped() && bank.loop < 0)
    out.push({ key: "E" as const, text: "Loop the security cameras", tone: "crime" as const, run: () => ((bank.loop = 0), notify()) });
  // The vault door.
  if (inAnte(you.x, you.z) && site.vaultAt < 0) {
    const door = toWorld(P.vaultDoor.lx, P.vaultWall.lz0 - 2);
    if (Math.hypot(you.x - door.x, you.z - door.z) < 6 && bank.drill < 0) out.push({ key: "R" as const, text: `Drill the vault door (${DRILL_TIME} s)`, tone: "crime" as const, run: startDrill });
  }
  return out;
});
