import { useSyncExternalStore } from "react";
import { BANK, BANK_PLAN, LOOT, LOOT_BOXES, SITE_CENTER, VAULT_DOOR_BOX, inBank, inJewelry, inLasers, inVault, toLocal, type Loot, type SiteKey } from "./city-layout";
import { hitsBox } from "./town-layout";
import { sound } from "./city-audio";

/*
 * The city game: your money (US dollars), and robbing the bank and the
 * jewelry shop. Plain TypeScript (no 3D code), shared by the 3D scene (which
 * reads it every frame to animate things) and the buttons on screen (which
 * re-draw when it changes, via useGame()).
 *
 * Money is pretend money for the 3D world only. It has nothing to do with
 * the real shop: it can't be spent at checkout, and it's only kept in this
 * browser (localStorage).
 *
 * How a robbery goes:
 *   1. Walk up to the bank counter (or the vault door) and press R. The alarm
 *      goes off, the tellers put their hands up, and the vault door is
 *      cracked open: the wheel spins, the bolts pull back, the door swings.
 *      In the jewelry shop, smashing the first glass case sets it off.
 *   2. Grab what you can: walk up to the gold, the cash, a case or the Big
 *      Rock and press R.
 *   3. Get away! Police cars race over and a helicopter circles. Get far
 *      enough from the building before the timer runs out (a getaway car
 *      helps) and you keep it all. If not: busted, and you lose what you took.
 *   4. A little while after, the place is restocked and you can do it again.
 */

/** How far from the building counts as "got away". */
export const ESCAPE_DISTANCE = 230;
/** How long you have to get away once the alarm goes off (seconds). */
export const ESCAPE_TIME = 85;
/** After a robbery, how long until the place is back to normal (and you're out of sight). */
const RESTOCK_AFTER = 35;
/** The vault door's opening, second by second: the wheel spins, the bolts pull back, then it swings open. */
export const VAULT = { spinUntil: 1.6, boltsUntil: 2.3, openUntil: 4.4 };
/** When the police turn up after the alarm. */
export const COPS_AFTER = 7;

const MONEY_KEY = "nest:city-money";
const START_CASH = 500;

export type Prompt = {
  /** Changes when the prompt does (so the screen only re-draws then). */
  id: string;
  /** R: rob / grab / smash. */
  rob?: { text: string; loot?: string; start?: SiteKey };
  /** E: talk to the teller. */
  talk?: { text: string };
};

export type Banner = { kind: "alarm" | "escaped" | "busted" | "info"; title: string; line: string; key: number };

export type SiteState = {
  alarm: boolean;
  alarmAt: number;
  /** When the vault started opening (bank only), or -1. */
  vaultAt: number;
  /** When it can be restocked (after the robbery's over), or 0 while it's not been robbed. */
  restockAt: number;
  /** When the police left (they drive off), or -1. */
  copsLeftAt: number;
};

const freshSite = (): SiteState => ({ alarm: false, alarmAt: 0, vaultAt: -1, restockAt: 0, copsLeftAt: -1 });

/** One "+$45,000" floating up the screen. */
export type Pop = { amount: number; key: number };

/** Something for the 3D scene to show once (bills flying, glass smashing, …). */
export type Fx = { kind: "cash" | "gold" | "gems" | "rock" | "shards" | "sparks" | "blast"; x: number; y: number; z: number; count: number };

export const game = {
  /** Seconds since the scene started (the 3D clock). */
  now: 0,
  cash: START_CASH,
  bank: 0,
  sites: { bank: freshSite(), jewelry: freshSite() } as Record<SiteKey, SiteState>,
  /** What's been taken (loot id → when). */
  taken: new Map<string, number>(),
  /** While the police are after you: which robbery, when it started, the deadline, and what you've got on you from it. */
  wanted: null as null | { site: SiteKey; startedAt: number; until: number; haul: number },
  prompt: null as Prompt | null,
  /** The bank's teller window is open. */
  teller: false,
  banner: null as Banner | null,
  pops: [] as Pop[],
  /** Distance to the building you robbed, while wanted (for the screen). */
  distance: 0,
  muted: false,
  /** Shakes the camera (decays by itself; camera.tsx reads it). */
  shake: 0,
  /** Effects waiting to be shown by the 3D scene. */
  fx: [] as Fx[],
  loaded: false,
};

// ---- Telling the screen ---------------------------------------------------------------------

let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version++;
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Re-draws whenever the game changes (money, prompts, banners…). */
export function useGame() {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  return game;
}

let counter = 0;
function banner(kind: Banner["kind"], title: string, line: string) {
  game.banner = { kind, title, line, key: ++counter };
  const key = game.banner.key;
  setTimeout(() => {
    if (game.banner?.key === key) {
      game.banner = null;
      changed();
    }
  }, kind === "info" ? 2600 : 3600);
}
function pop(amount: number) {
  const p = { amount, key: ++counter };
  game.pops = [...game.pops, p].slice(-5);
  setTimeout(() => {
    game.pops = game.pops.filter((x) => x.key !== p.key);
    changed();
  }, 1700);
}

// ---- Money ------------------------------------------------------------------------------------

/** Loads your money from this browser (once). */
export function loadMoney() {
  if (game.loaded) return;
  game.loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(MONEY_KEY) ?? "null") as { cash?: number; bank?: number; muted?: boolean } | null;
    if (saved && Number.isFinite(saved.cash) && Number.isFinite(saved.bank)) {
      game.cash = Math.max(0, Math.round(saved.cash!));
      game.bank = Math.max(0, Math.round(saved.bank!));
      game.muted = Boolean(saved.muted);
    }
  } catch {
    // Private browsing can block storage: start fresh.
  }
  sound.mute(game.muted);
  changed();
}
function saveMoney() {
  try {
    localStorage.setItem(MONEY_KEY, JSON.stringify({ cash: game.cash, bank: game.bank, muted: game.muted }));
  } catch {
    // Not a problem.
  }
}

/** "$1,234,567" */
export function usd(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Put cash in the bank (or take it out, with a negative amount). Returns false if there isn't enough. */
export function transfer(amount: number) {
  if (amount > 0 && amount > game.cash) return false;
  if (amount < 0 && -amount > game.bank) return false;
  game.cash -= amount;
  game.bank += amount;
  saveMoney();
  sound.cash();
  changed();
  return true;
}

export function toggleMute() {
  game.muted = !game.muted;
  sound.mute(game.muted);
  saveMoney();
  changed();
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

function soundAlarm(site: SiteKey, why: string) {
  const s = game.sites[site];
  if (s.alarm) return;
  s.alarm = true;
  s.alarmAt = game.now;
  s.restockAt = 0;
  s.copsLeftAt = -1;
  if (game.wanted) {
    // Robbing a second place while they're already after you: more time on the clock, same chase.
    game.wanted.until = Math.max(game.wanted.until, game.now + ESCAPE_TIME * 0.6);
  } else {
    game.wanted = { site, startedAt: game.now, until: game.now + ESCAPE_TIME, haul: 0 };
  }
  game.teller = false;
  banner("alarm", "Alarm!", why);
  sound.alarm(true);
}

function startBankJob() {
  if (game.sites.bank.vaultAt >= 0) return;
  soundAlarm("bank", "Grab the loot from the vault and get away!");
  game.sites.bank.vaultAt = game.now;
  const p = BANK_PLAN;
  const door = toWorldBank(0, p.vaultWall.lz1);
  game.fx.push({ kind: "sparks", x: door.x, y: p.vaultDoor.y, z: door.z, count: 50 });
  sound.drill();
}
const toWorldBank = (lx: number, lz: number) => {
  const c = Math.cos(BANK.turn);
  const n = Math.sin(BANK.turn);
  return { x: BANK.x + lx * c + lz * n, z: BANK.z - lx * n + lz * c };
};

function grab(l: Loot) {
  if (isTaken(l.id)) return;
  if (l.site === "jewelry") soundAlarm("jewelry", l.kind === "rock" ? "You grabbed the Big Rock! Now run!" : "You smashed a case! Grab what you can and run!");
  game.taken.set(l.id, game.now);
  game.cash += l.value;
  if (game.wanted) game.wanted.haul += l.value;
  saveMoney();
  pop(l.value);
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
  if (r.start === "bank") startBankJob();
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

// ---- Every frame ------------------------------------------------------------------------------

/**
 * Called every frame by the 3D scene with the clock and where you are (on
 * foot, or in a car). Works out what you can do here, and runs the chase.
 */
export function tick(now: number, dt: number, you: { x: number; z: number; onFoot: boolean; driving: boolean }) {
  game.now = now;
  game.shake = Math.max(0, game.shake - dt * 2.5);
  let dirty = false;

  // ---- The chase ----
  const w = game.wanted;
  if (w) {
    const c = SITE_CENTER[w.site];
    game.distance = Math.hypot(you.x - c.x, you.z - c.z);
    if (game.distance > ESCAPE_DISTANCE) {
      endChase(true);
      dirty = true;
    } else if (now > w.until) {
      endChase(false);
      dirty = true;
    }
  }

  // ---- Restocking once it's all over and you've gone ----
  for (const key of ["bank", "jewelry"] as SiteKey[]) {
    const s = game.sites[key];
    if (!s.restockAt || now < s.restockAt) continue;
    const c = SITE_CENTER[key];
    if (Math.hypot(you.x - c.x, you.z - c.z) < 70) continue;
    game.sites[key] = freshSite();
    for (const l of LOOT) if (l.site === key) game.taken.delete(l.id);
    dirty = true;
  }

  // ---- Walking through the lasers sets them off ----
  if (you.onFoot && !isTaken("rock") && !game.sites.jewelry.alarm && inLasers(you.x, you.z)) {
    soundAlarm("jewelry", "You tripped the lasers! Grab the Big Rock and run!");
    dirty = true;
  }

  // ---- What can you do here? ----
  const prompt = you.onFoot && !you.driving ? promptAt(you.x, you.z) : null;
  if ((prompt?.id ?? null) !== (game.prompt?.id ?? null)) {
    game.prompt = prompt;
    if (!prompt?.talk && game.teller) game.teller = false;
    dirty = true;
  }
  if (dirty) changed();
}

function endChase(escaped: boolean) {
  const w = game.wanted!;
  game.wanted = null;
  sound.alarm(false);
  for (const key of ["bank", "jewelry"] as SiteKey[]) {
    const s = game.sites[key];
    if (s.alarm && !s.restockAt) {
      s.restockAt = game.now + RESTOCK_AFTER;
      s.copsLeftAt = game.now;
    }
  }
  if (escaped) {
    banner("escaped", "You got away!", w.haul > 0 ? `You kept ${usd(w.haul)}. Put it in the bank to keep it safe.` : "Clean getaway... but empty-handed!");
    sound.win();
  } else {
    const lost = Math.min(game.cash, w.haul);
    game.cash -= lost;
    saveMoney();
    banner("busted", "Busted!", lost > 0 ? `The police took back ${usd(lost)}.` : "Next time, get further away!");
    sound.busted();
  }
}

function promptAt(x: number, z: number): Prompt | null {
  // ---- The bank ----
  if (inBank(x, z)) {
    const { lx, lz } = toLocal(BANK, x, z);
    const bank = game.sites.bank;
    const C = BANK_PLAN.counter;
    // In the vault (or at its open door): the nearest pile of loot.
    if (vaultOpen() && (inVault(x, z) || lz < BANK_PLAN.vaultWall.lz1 + 3)) {
      const l = nearestLoot("bank", x, z);
      if (l) return { id: `grab-${l.id}`, rob: { text: `Grab ${l.label} · ${usd(l.value)}`, loot: l.id } };
    }
    if (bank.vaultAt >= 0) return null;
    if (bank.restockAt) return null;
    // At the counter: bank, or rob.
    const atCounter = lx > C.lx0 - 1 && lx < C.lx1 + 1 && lz > C.lz1 && lz < C.lz1 + 4.5;
    const atVault = Math.abs(lx) < 8 && lz < BANK_PLAN.vaultWall.lz1 + 5 && lz > BANK_PLAN.vaultWall.lz1;
    if (atCounter) return { id: "bank-counter", talk: { text: "Talk to the teller" }, rob: { text: "Rob the bank!", start: "bank" } };
    if (atVault) return { id: "bank-vault", rob: { text: "Crack the vault!", start: "bank" } };
    return null;
  }
  // ---- The jewelry shop ----
  if (inJewelry(x, z)) {
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

/** Things that block you only some of the time: the vault door (till it's open) and the piles of loot in the vault (till they're taken). */
export function heistBlocks(x: number, z: number, r: number) {
  if (Math.abs(x - BANK.x) > 40 || Math.abs(z - BANK.z) > 50) return false;
  if (!vaultOpen() && hitsBox(x, z, r, VAULT_DOOR_BOX)) return true;
  for (const id in LOOT_BOXES) if (!isTaken(id) && hitsBox(x, z, r, LOOT_BOXES[id])) return true;
  return false;
}
