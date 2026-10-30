import { BANK, BANK_PLAN, JEWELRY, JEWELRY_PLAN, LOOT, SITE_CENTER, inBank, inJewelry, inVault, toLocal, toWorld, type Loot, type SiteKey } from "./city-layout";
import { gateOn, inCorridor, sweepBeam, vaultBeams } from "./bank-layout";
import { resetBank, tickBank } from "./bank-heist";
import { sound } from "./city-audio";
import { notify, useGameVersion } from "./game-events";
import { provide } from "./interact";
import { kill, life } from "./life";
import { earn, pockets, profile, saveProfile, usd } from "./profile";
import { hitsBox } from "./town-layout";
import { BASE } from "./world-map";
import { player } from "./you";

export { usd, profile };

/*
 * Robbing the bank and the jewelry shop. Plain TypeScript (no 3D code),
 * shared by the 3D scene (which reads it every frame to animate things) and
 * the buttons on screen (which re-draw when it changes, via useGame()).
 *
 * How a robbery goes:
 *   1. At the bank counter (or the vault door) press R: the alarm goes off,
 *      the tellers put their hands up, and the vault is cracked open. In the
 *      jewelry shop, smashing the first case (or walking into the lasers…)
 *      sets it off.
 *   2. Grab what you can (R). Careful: lasers sweep the vault floor (jump
 *      over them!) and fence in the Big Rock. Touching one kills you.
 *   3. The loot isn't yours yet. Get it to the secret base in the mountains
 *      before the timer runs out: drive up the mountain road (north from the
 *      city's north-east corner) and into the hidden hangar. Too slow, and
 *      the loot's too hot to keep: you dump it. Get caught by the police
 *      (they chase you, and hop out to run after you on foot) and you're
 *      handcuffed and taken to jail.
 *   4. Once you've walked out, the place closes for 30 minutes (a countdown
 *      floats over it) and then it's restocked.
 *
 * Money is pretend money for the 3D world only (profile.ts).
 */

/** How long you've got to get the loot to the secret base (seconds). */
export const DELIVER_TIME = 200;
/** How long a robbed place stays closed (seconds of real time). */
export const CLOSED_FOR = 30 * 60;
/** The vault door's opening, second by second: the wheel spins, the bolts pull back, then it swings open. */
export const VAULT = { spinUntil: 1.6, boltsUntil: 2.3, openUntil: 4.4 };
/** The spot in the secret base's hangar where you drop the loot. */
export const DROP_ZONE = { x: BASE.x, z: BASE.doorZ - BASE.depth * 0.62, r: 7 };

const CLOSED_KEY = "nest:city-closed";

export type Prompt = {
  /** Changes when the prompt does (so the screen only re-draws then). */
  id: string;
  /** R: rob / grab / smash. */
  rob?: { text: string; loot?: string; start?: SiteKey };
  /** E: talk to the teller. */
  talk?: { text: string };
};

export type Banner = { kind: "alarm" | "escaped" | "busted" | "info" | "dead"; title: string; line: string; key: number };

export type SiteState = {
  alarm: boolean;
  alarmAt: number;
  /** When the vault started opening (bank only), or -1. */
  vaultAt: number;
  /** When it opens again (real time, ms since 1970), or 0 if it's open. */
  closedUntil: number;
};

const freshSite = (): SiteState => ({ alarm: false, alarmAt: 0, vaultAt: -1, closedUntil: 0 });

/** One "+$45,000" floating up the screen. */
export type Pop = { amount: number; key: number; label?: string };

/** Something for the 3D scene to show once (bills flying, glass smashing, …). */
export type Fx = { kind: "cash" | "gold" | "gems" | "rock" | "shards" | "sparks" | "blast"; x: number; y: number; z: number; count: number };

export const game = {
  /** Seconds since the scene started (the 3D clock). */
  now: 0,
  sites: { bank: freshSite(), jewelry: freshSite() } as Record<SiteKey, SiteState>,
  /** What's been taken (loot id → when). */
  taken: new Map<string, number>(),
  /** While the police are after you: which robbery, when it started, the deadline, and the loot you're carrying. */
  wanted: null as null | { site: SiteKey; startedAt: number; until: number; haul: number },
  prompt: null as Prompt | null,
  /** The bank's teller window is open. */
  teller: false,
  banner: null as Banner | null,
  pops: [] as Pop[],
  /** How far you are from the secret base, while carrying loot (for the screen). */
  distance: 0,
  /** Shakes the camera (decays by itself; camera.tsx reads it). */
  shake: 0,
  /** Effects waiting to be shown by the 3D scene. */
  fx: [] as Fx[],
  /** Real time now (ms), updated every frame (for the closed-for-30-minutes signs). */
  wallClock: Date.now(),
};

/** Re-draws whenever the game changes (money, prompts, banners…). */
export function useGame() {
  useGameVersion();
  return game;
}
const changed = notify;

let counter = 0;
export function banner(kind: Banner["kind"], title: string, line: string, seconds?: number) {
  game.banner = { kind, title, line, key: ++counter };
  const key = game.banner.key;
  setTimeout(
    () => {
      if (game.banner?.key === key) {
        game.banner = null;
        changed();
      }
    },
    (seconds ?? (kind === "info" ? 2.6 : 3.6)) * 1000,
  );
  changed();
}
export function pop(amount: number, label?: string) {
  const p = { amount, key: ++counter, label };
  game.pops = [...game.pops, p].slice(-5);
  setTimeout(() => {
    game.pops = game.pops.filter((x) => x.key !== p.key);
    changed();
  }, 1700);
  changed();
}

// ---- Closed for 30 minutes (remembered in this browser) --------------------------------------

function loadClosures() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? "{}") as Partial<Record<SiteKey, number>>;
    for (const k of ["bank", "jewelry"] as SiteKey[]) if (typeof saved[k] === "number" && saved[k]! > Date.now()) game.sites[k].closedUntil = saved[k]!;
  } catch {
    // Nothing saved.
  }
}
function saveClosures() {
  try {
    localStorage.setItem(CLOSED_KEY, JSON.stringify({ bank: game.sites.bank.closedUntil, jewelry: game.sites.jewelry.closedUntil }));
  } catch {
    // Not a problem.
  }
}
if (typeof window !== "undefined") loadClosures();

/** Is it closed right now? How many seconds until it opens? */
export const isClosed = (site: SiteKey) => game.sites[site].closedUntil > game.wallClock;
export const closedFor = (site: SiteKey) => Math.max(0, Math.ceil((game.sites[site].closedUntil - game.wallClock) / 1000));

function closeSite(site: SiteKey) {
  const s = game.sites[site];
  if (s.closedUntil > game.wallClock) return;
  s.closedUntil = game.wallClock + CLOSED_FOR * 1000;
  saveClosures();
}

// ---- Money ------------------------------------------------------------------------------------

export function toggleMute() {
  profile.muted = !profile.muted;
  sound.mute(profile.muted);
  saveProfile();
}
export function setTeller(open: boolean) {
  game.teller = open;
  changed();
}

// ---- Robbing ---------------------------------------------------------------------------------

export const isTaken = (id: string) => game.taken.has(id);
/** How far the vault door has got: seconds since it started opening, or -1 if it's shut. */
export function vaultTime() {
  const at = game.sites.bank.vaultAt;
  return at < 0 ? -1 : game.now - at;
}
export const vaultOpen = () => vaultTime() >= VAULT.openUntil - 0.6;

export function soundAlarm(site: SiteKey, why: string) {
  const s = game.sites[site];
  if (s.alarm) return;
  s.alarm = true;
  s.alarmAt = game.now;
  if (game.wanted) {
    // Robbing a second place while they're already after you: more time on the clock, same chase.
    game.wanted.until = Math.max(game.wanted.until, game.now + DELIVER_TIME * 0.6);
  } else {
    game.wanted = { site, startedAt: game.now, until: game.now + DELIVER_TIME, haul: 0 };
  }
  game.teller = false;
  banner("alarm", "Alarm!", why);
  sound.alarm(true);
}

/** Holding up the tellers: a little cash from the drawers (the real money's in the vault downstairs). */
function robTellers() {
  if (game.sites.bank.alarm) return;
  soundAlarm("bank", "The tellers hit the panic button! Grab the cash and run (the real money's in the vault).");
  const take = 4 * (2500 + Math.round(Math.random() * 1500));
  if (game.wanted) game.wanted.haul += take;
  pop(take, "loot");
  const c = toWorld(BANK, 0, BANK_PLAN.counter.lz1);
  game.fx.push({ kind: "cash", x: c.x, y: 8, z: c.z, count: 40 });
  sound.cash();
}

function grab(l: Loot) {
  if (isTaken(l.id)) return;
  if (l.site === "jewelry") soundAlarm("jewelry", l.kind === "rock" ? "You grabbed the Big Rock! Get it to the secret base!" : "You smashed a case! Grab what you can and get to the secret base!");
  game.taken.set(l.id, game.now);
  // The loot's not yours yet: it's in your bag until you stash it at the base.
  if (game.wanted) game.wanted.haul += l.value;
  pop(l.value, "loot");
  const y = l.kind === "rock" ? 3.6 : l.kind === "case" ? 2.8 : 1.6;
  if (l.kind === "case") {
    game.fx.push({ kind: "shards", x: l.x, y, z: l.z, count: 70 });
    game.fx.push({ kind: "gems", x: l.x, y, z: l.z, count: 26 });
    sound.smash();
    game.shake = Math.max(game.shake, 0.35);
  } else if (l.kind === "rock") {
    game.fx.push({ kind: "rock", x: l.x, y, z: l.z, count: 1 });
    game.fx.push({ kind: "gems", x: l.x, y, z: l.z, count: 40 });
    game.fx.push({ kind: "shards", x: l.x, y: 4.2, z: l.z, count: 50 });
    sound.smash();
  } else {
    game.fx.push({ kind: l.kind === "gold" ? "gold" : "cash", x: l.x, y, z: l.z, count: l.kind === "gold" ? 34 : 60 });
  }
  sound.cash();
}

/** Pressed R (or tapped the button). */
export function rob() {
  const r = game.prompt?.rob;
  if (!r) return;
  if (r.start === "bank") robTellers();
  else if (r.loot) {
    const l = LOOT.find((x) => x.id === r.loot);
    if (l) grab(l);
  }
  game.prompt = null;
  changed();
}

/** Pressed E (or tapped the button) at the teller window. */
export function talk() {
  if (!game.prompt?.talk) return;
  setTeller(true);
}

/** Caught by the police (city-police.tsx): the loot's gone. */
export function busted() {
  const w = game.wanted;
  pockets.bankCard = false;
  game.wanted = null;
  sound.alarm(false);
  closeAlarmedSites();
  sound.busted();
  return w?.haul ?? 0;
}

function closeAlarmedSites() {
  for (const key of ["bank", "jewelry"] as SiteKey[]) if (game.sites[key].alarm) closeSite(key);
}

// ---- Lasers ---------------------------------------------------------------------------------

/** Where the vault's two sweeping laser beams are right now (in the bank's frame: lz), and how high. */
export const vaultLasers = vaultBeams;
/** Are the vault lasers on? (Once the vault's open, until it's empty.) */
export const vaultLasersOn = () => vaultOpen() && LOOT.some((l) => l.site === "bank" && !isTaken(l.id));

/**
 * The jewelry shop's laser fence round the Big Rock: three beams that sweep
 * up and down, and every few seconds all rise out of the way for a moment
 * (that's your chance). Returns each beam's height.
 */
export function jewelryLasers(now: number) {
  const t = now % 6;
  // 0–4 s: down low and bobbing; 4–4.6 s: rising; 4.6–5.6 s: up out of reach; 5.6–6 s: coming back down.
  const lift = t < 4 ? 0 : t < 4.6 ? (t - 4) / 0.6 : t < 5.6 ? 1 : 1 - (t - 5.6) / 0.4;
  return [0, 1, 2].map((k) => 0.7 + k * 0.85 + Math.sin(now * 2 + k * 2.1) * 0.3 * (1 - lift) + lift * 4.2);
}
export const jewelryLasersOn = () => !isTaken("rock") && !isClosed("jewelry");

/** Does a beam at height `beamY` pass through you (feet at `y`)? */
const throughYou = (beamY: number, y: number) => beamY > y + 0.05 && beamY < y + 3.3;

function laserCheck(x: number, z: number, y: number) {
  // Vault beams.
  if (vaultLasersOn() && inVault(x, z)) {
    const { lz } = toLocal(BANK, x, z);
    for (const b of vaultLasers(game.now)) if (Math.abs(lz - b.lz) < 0.35 && throughYou(b.y, y)) return true;
  }
  // The laser corridor on the way to the vault: the blinking gates (no getting past one while it's on) and the low sweeping beam.
  if (inCorridor(x, z) && !isClosed("bank")) {
    const { lx } = toLocal(BANK, x, z);
    for (const [i, gx] of BANK_PLAN.gates.entries()) if (gateOn(i, game.now) && Math.abs(lx - gx) < 0.4) return true;
    const b = sweepBeam(game.now);
    if (Math.abs(lx - b.lx) < 0.35 && throughYou(b.y, y)) return true;
  }
  // The jewelry fence: crossing its edge while a beam's at your height.
  if (jewelryLasersOn() && inJewelry(x, z)) {
    const { lx, lz } = toLocal(JEWELRY, x, z);
    const L = JEWELRY_PLAN.lasers;
    const inside = lx > L.lx0 - 0.35 && lx < L.lx1 + 0.35 && lz > L.lz0 - 0.35 && lz < L.lz1 + 0.35;
    const edge = Math.min(Math.abs(lx - L.lx0), Math.abs(lx - L.lx1), Math.abs(lz - L.lz0), Math.abs(lz - L.lz1));
    if (inside && edge < 0.35 && jewelryLasers(game.now).some((h) => throughYou(h, y))) return true;
  }
  return false;
}

// ---- Every frame ------------------------------------------------------------------------------

/**
 * Called every frame by the 3D scene with the clock and where you are (on
 * foot, or in a car). Works out what you can do here, the lasers, the
 * deadline, delivering the loot, and reopening places.
 */
export function tick(now: number, dt: number, you: { x: number; z: number; y: number; onFoot: boolean; driving: boolean }) {
  game.now = now;
  game.wallClock = Date.now();
  game.shake = Math.max(0, game.shake - dt * 2.5);
  let dirty = false;

  // ---- The deadline, and stashing the loot at the base ----
  const w = game.wanted;
  if (w) {
    game.distance = Math.hypot(you.x - DROP_ZONE.x, you.z - DROP_ZONE.z);
    if (game.distance < DROP_ZONE.r && w.haul > 0) {
      game.wanted = null;
      earn(w.haul);
      sound.alarm(false);
      sound.win();
      banner("escaped", "Loot stashed!", `${usd(w.haul)} is yours. Put it in the bank so you don't lose it.`);
      pop(w.haul);
      closeAlarmedSites();
      dirty = true;
    } else if (now > w.until) {
      game.wanted = null;
      sound.alarm(false);
      banner("busted", "Too slow!", w.haul > 0 ? `The loot got too hot. You dumped ${usd(w.haul)}.` : "The police lost interest.");
      closeAlarmedSites();
      dirty = true;
    }
  }

  // ---- Walking out of a place you've robbed closes it ----
  for (const key of ["bank", "jewelry"] as SiteKey[]) {
    const s = game.sites[key];
    const inside = key === "bank" ? inBank(you.x, you.z) : inJewelry(you.x, you.z);
    const out = outside(key === "bank" ? BANK : JEWELRY, you.x, you.z);
    if (s.alarm && out && !isClosed(key) && LOOT.some((l) => l.site === key && isTaken(l.id))) {
      closeSite(key);
      dirty = true;
    }
    // Opens again (restocked) once its 30 minutes are up.
    if (s.closedUntil && game.wallClock > s.closedUntil && !inside) {
      game.sites[key] = freshSite();
      for (const l of LOOT) if (l.site === key) game.taken.delete(l.id);
      if (key === "bank") resetBank();
      saveClosures();
      dirty = true;
    }
  }

  // ---- Lasers ----
  if (you.onFoot && !life.dead && laserCheck(you.x, you.z, you.y)) {
    kill("laser");
    game.wanted = null;
    sound.alarm(false);
    closeAlarmedSites();
    dirty = true;
  }
  // Walking into the jewelry shop's laser fence before it's robbed sets the alarm off too.
  if (you.onFoot && jewelryLasersOn() && !game.sites.jewelry.alarm && inJewelry(you.x, you.z)) {
    const { lx, lz } = toLocal(JEWELRY, you.x, you.z);
    const L = JEWELRY_PLAN.lasers;
    if (lx > L.lx0 && lx < L.lx1 && lz > L.lz0 && lz < L.lz1) {
      soundAlarm("jewelry", "You slipped past the lasers! Grab the Big Rock and run!");
      dirty = true;
    }
  }

  // ---- The bank's keycard, cameras, drill… (bank-heist.ts) ----
  if (tickBank(now, dt, you)) dirty = true;

  // ---- What can you do here? ----
  const prompt = you.onFoot && !you.driving && !life.dead ? promptAt(you.x, you.z) : null;
  if ((prompt?.id ?? null) !== (game.prompt?.id ?? null)) {
    game.prompt = prompt;
    if (!prompt?.talk && game.teller) game.teller = false;
    dirty = true;
  }
  if (dirty) changed();
}

function promptAt(x: number, z: number): Prompt | null {
  // ---- The bank ----
  if (inBank(x, z)) {
    const { lx, lz } = toLocal(BANK, x, z);
    const bank = game.sites.bank;
    const C = BANK_PLAN.counter;
    const atCounter = player.level === 1 && lx > C.lx0 - 1 && lx < C.lx1 + 1 && lz > C.lz1 && lz < C.lz1 + 4.5;
    if (isClosed("bank")) return atCounter ? { id: "bank-teller-closed", talk: { text: "Talk to the teller" } } : null;
    // In the vault: the nearest pile of loot.
    if (vaultOpen() && inVault(x, z)) {
      const l = nearestLoot("bank", x, z);
      if (l) return { id: `grab-${l.id}`, rob: { text: `Grab ${l.label} · ${usd(l.value)}`, loot: l.id } };
    }
    if (atCounter) return bank.alarm ? { id: "bank-counter-alarm" } : { id: "bank-counter", talk: { text: "Talk to the teller" }, rob: { text: "Hold up the tellers", start: "bank" } };
    return null;
  }
  // ---- The jewelry shop ----
  if (inJewelry(x, z) && !isClosed("jewelry")) {
    const l = nearestLoot("jewelry", x, z);
    if (!l) return null;
    return { id: `grab-${l.id}`, rob: { text: l.kind === "rock" ? `Grab the Big Rock · ${usd(l.value)}` : `Smash the case · ${l.label} · ${usd(l.value)}`, loot: l.id } };
  }
  return null;
}

function nearestLoot(site: SiteKey, x: number, z: number) {
  let best: Loot | null = null;
  let bestD = Infinity;
  for (const l of LOOT) {
    if (l.site !== site || isTaken(l.id)) continue;
    const d = Math.hypot(l.x - x, l.z - z);
    if (d < l.reach && d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

/**
 * Things that block you only some of the time: the vault door (till it's
 * open), the piles of loot in the vault (till they're taken), and the doors
 * of a place that's closed.
 */
export function heistBlocks(x: number, z: number, r: number) {
  if (Math.abs(x - BANK.x) < 50 && Math.abs(z - BANK.z) < 60 && player.level === 1) {
    // Closed: the doors are locked to anyone outside (never to someone still inside: you can always get out).
    if (isClosed("bank") && outside(BANK, player.x, player.z) && hitsBox(x, z, r, BANK_DOORWAY)) return true;
  }
  if (isClosed("jewelry") && Math.abs(x - JEWELRY.x) < 30 && Math.abs(z - JEWELRY.z) < 30 && outside(JEWELRY, player.x, player.z) && hitsBox(x, z, r, JEWELRY_DOORWAY)) return true;
  return false;
}
/** Properly outside a building: out past its front doors (or nowhere near it). */
function outside(site: typeof BANK, x: number, z: number) {
  if (Math.abs(x - site.x) > 60 || Math.abs(z - site.z) > 60) return true;
  const { lx, lz } = toLocal(site, x, z);
  // The bank: off its podium (down the front steps or the fire stairs).
  if (site === BANK) return Math.abs(lx) > BANK_PLAN.halfW + 1 || lz > BANK_PLAN.porch + 1 || lz < -BANK_PLAN.depth - 1;
  return lz > 1.2 || Math.abs(lx) > 30;
}
const doorway = (site: typeof BANK, half: number, wall: number) => {
  const p = toWorld(site, 0, -wall / 2);
  return { x: p.x, z: p.z, hw: half, hd: wall / 2 + 0.2, turn: site.turn };
};
const BANK_DOORWAY = doorway(BANK, BANK_PLAN.doorHalf, BANK_PLAN.wall);
const JEWELRY_DOORWAY = doorway(JEWELRY, JEWELRY_PLAN.doorHalf, JEWELRY_PLAN.wall);

/** The middle of each building (for the closed signs). */
export { SITE_CENTER };

// What you can do here, for the on-screen prompt (interact.ts).
provide("heist", () => {
  const p = game.prompt;
  if (!p) return null;
  const out = [];
  if (p.rob) out.push({ key: "R" as const, text: p.rob.text, run: rob, tone: "crime" as const });
  if (p.talk) out.push({ key: "E" as const, text: p.talk.text, run: talk });
  return out;
});
